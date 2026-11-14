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
