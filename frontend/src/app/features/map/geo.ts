import { PolygonGeometry } from '../../core/models';
import { LatLng } from './polygon-editor';

// Radio de la esfera autálica de WGS84 (misma superficie que el elipsoide), en metros.
const AUTHALIC_RADIUS_M = 6371007.1809;

/**
 * Superficie aproximada de un polígono [lat, lng] en hectáreas, para mostrar mientras se dibuja.
 *
 * Proyecta a una Lambert azimutal de áreas iguales centrada en el polígono y aplica la fórmula
 * del área de Gauss. El valor que queda guardado lo calcula el backend (core/geo.py, geodésico).
 */
export function areaHa(points: readonly LatLng[]): number {
  if (points.length < 3) return 0;
  const toRad = Math.PI / 180;
  const lat0 = (points.reduce((sum, [lat]) => sum + lat, 0) / points.length) * toRad;
  const lng0 = (points.reduce((sum, [, lng]) => sum + lng, 0) / points.length) * toRad;
  const projected = points.map(([lat, lng]) => {
    const phi = lat * toRad;
    const dLambda = lng * toRad - lng0;
    const q =
      1 + Math.sin(lat0) * Math.sin(phi) + Math.cos(lat0) * Math.cos(phi) * Math.cos(dLambda);
    const k = Math.sqrt(2 / q);
    return [
      AUTHALIC_RADIUS_M * k * Math.cos(phi) * Math.sin(dLambda),
      AUTHALIC_RADIUS_M *
        k *
        (Math.cos(lat0) * Math.sin(phi) - Math.sin(lat0) * Math.cos(phi) * Math.cos(dLambda)),
    ];
  });
  let twiceArea = 0;
  projected.forEach(([x1, y1], i) => {
    const [x2, y2] = projected[(i + 1) % projected.length];
    twiceArea += x1 * y2 - x2 * y1;
  });
  return Math.abs(twiceArea) / 2 / 10_000;
}

/**
 * superficie aproximada de un polígono geojson en hectáreas, descontando los huecos
 *
 * usa la misma proyección de áreas iguales que areaHa, anillo por anillo: el primero es el
 * exterior y los demás son huecos. no depende del sentido de giro de los anillos. el valor que
 * queda guardado lo calcula el backend
 */
export function geometryAreaHa(geometry: PolygonGeometry): number {
  const [exterior, ...holes] = geometry.coordinates.map(ringToLatLngs);
  if (!exterior) return 0;
  const holesHa = holes.reduce((sum, hole) => sum + areaHa(hole), 0);
  return Math.max(0, areaHa(exterior) - holesHa);
}

// anillo geojson [lng, lat] a puntos [lat, lng], sin el punto de cierre repetido: areaHa centra
// la proyección en el promedio de los puntos y el cierre lo correría
function ringToLatLngs(ring: number[][]): LatLng[] {
  const last = ring.length - 1;
  const closed = last > 0 && ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1];
  return (closed ? ring.slice(0, last) : ring).map(([lng, lat]): LatLng => [lat, lng]);
}

/** GeoJSON Polygon para la API: pares [longitud, latitud] y anillo cerrado. */
export function toPolygonGeometry(points: readonly LatLng[]): PolygonGeometry {
  const ring = points.map(([lat, lng]) => [round(lng), round(lat)]);
  if (ring.length > 0) ring.push([...ring[0]]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Redondea a 6 decimales (unos 10 cm): más precisión no tiene sentido para un lote. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * true si el anillo cerrado que forman los puntos se cruza a sí mismo: dos lados que no son
 * vecinos se tocan, o dos lados vecinos se superponen. es la misma condición que hace que el
 * backend rechace el polígono ("se cruza o no cierra"), revisada antes de guardar
 *
 * trabaja en grados [lat, lng] como plano: a la escala de un lote la deformación no cambia si
 * dos segmentos se cortan
 */
export function ringSelfIntersects(points: readonly LatLng[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const c = points[j];
      const d = points[(j + 1) % n];
      const neighbours = j === i + 1 || (i === 0 && j === n - 1);
      if (neighbours) {
        // lados vecinos: comparten un vértice; solo fallan si vuelven sobre sí mismos (alineados
        // y con el vértice compartido afuera del tramo entre los otros dos extremos)
        const shared = j === i + 1 ? b : a;
        const [p, q] = j === i + 1 ? [a, d] : [b, c];
        if (orientation(p, shared, q) === 0 && !onSegment(shared, p, q)) return true;
        continue;
      }
      if (segmentsTouch(a, b, c, d)) return true;
    }
  }
  return false;
}

/**
 * centro de masa del polígono [lat, lng] (fórmula del área de Gauss en el plano), para ubicar
 * la etiqueta de hectáreas. con área nula o sin puntos devuelve el promedio o null
 */
export function ringCentroid(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const [lat0, lng0] = points[0];
  let twiceArea = 0;
  let sumLat = 0;
  let sumLng = 0;
  points.forEach(([lat1, lng1], i) => {
    const [lat2, lng2] = points[(i + 1) % points.length];
    const x1 = lng1 - lng0;
    const y1 = lat1 - lat0;
    const x2 = lng2 - lng0;
    const y2 = lat2 - lat0;
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    sumLng += (x1 + x2) * cross;
    sumLat += (y1 + y2) * cross;
  });
  if (Math.abs(twiceArea) < 1e-14) {
    const lat = points.reduce((sum, [value]) => sum + value, 0) / points.length;
    const lng = points.reduce((sum, [, value]) => sum + value, 0) / points.length;
    return [lat, lng];
  }
  return [lat0 + sumLat / (3 * twiceArea), lng0 + sumLng / (3 * twiceArea)];
}

// -1, 0 o 1 según el giro de p → q → r (0: alineados)
function orientation(p: LatLng, q: LatLng, r: LatLng): number {
  const value = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(value) < 1e-18) return 0;
  return value > 0 ? 1 : -1;
}

// q está dentro de la caja de p-r (ya se sabe que los tres están alineados)
function onSegment(q: LatLng, p: LatLng, r: LatLng): boolean {
  return (
    Math.min(p[0], r[0]) <= q[0] &&
    q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] &&
    q[1] <= Math.max(p[1], r[1])
  );
}

function segmentsTouch(a: LatLng, b: LatLng, c: LatLng, d: LatLng): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && onSegment(c, a, b)) ||
    (o2 === 0 && onSegment(d, a, b)) ||
    (o3 === 0 && onSegment(a, c, d)) ||
    (o4 === 0 && onSegment(b, c, d))
  );
}
