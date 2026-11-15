import type { PolygonGeometry } from '../models';
import type { LatLng } from './models';

/** radio de la esfera de la grilla sinusoidal de MODIS, en metros */
export const MODIS_SPHERE_RADIUS_M = 6371007.181;

const DEG = Math.PI / 180;
const KM_PER_DEG_LAT = 111.195;

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** ray casting sobre un anillo GeoJSON [lng, lat] */
function inRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** true si el punto cae dentro del anillo exterior y fuera de los huecos */
export function pointInPolygon([lat, lng]: LatLng, geometry: PolygonGeometry): boolean {
  const [outer, ...holes] = geometry.coordinates;
  if (!outer || !inRing(lat, lng, outer)) return false;
  return !holes.some((hole) => inRing(lat, lng, hole));
}

/** área con signo del anillo en grados²: positiva si es antihorario */
function signedArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

/** centroide del anillo exterior; si el área es nula, el promedio de los vértices */
export function centroid(geometry: PolygonGeometry): LatLng {
  const ring = geometry.coordinates[0] ?? [];
  const area = signedArea(ring);
  if (Math.abs(area) > 1e-12) {
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      cx += (ring[j][0] + ring[i][0]) * f;
      cy += (ring[j][1] + ring[i][1]) * f;
    }
    return [cy / (6 * area), cx / (6 * area)];
  }
  const n = ring.length || 1;
  return [ring.reduce((s, p) => s + p[1], 0) / n, ring.reduce((s, p) => s + p[0], 0) / n];
}

export function bbox(geometries: PolygonGeometry[]): BBox {
  const box = { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity };
  for (const g of geometries) {
    for (const [lng, lat] of g.coordinates[0] ?? []) {
      box.minLat = Math.min(box.minLat, lat);
      box.maxLat = Math.max(box.maxLat, lat);
      box.minLng = Math.min(box.minLng, lng);
      box.maxLng = Math.max(box.maxLng, lng);
    }
  }
  return box;
}

/** semilados de la caja alrededor de un centro, en km (norte-sur y este-oeste) */
export function halfExtentKm(box: BBox, [lat, lng]: LatLng): { ns: number; ew: number } {
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos(lat * DEG);
  return {
    ns: Math.max(box.maxLat - lat, lat - box.minLat) * KM_PER_DEG_LAT,
    ew: Math.max(box.maxLng - lng, lng - box.minLng) * kmPerDegLng,
  };
}

/** metros de la grilla sinusoidal a [lat, lng] */
export function sinusoidalToLatLng(x: number, y: number): LatLng {
  const lat = y / MODIS_SPHERE_RADIUS_M;
  const lng = x / (MODIS_SPHERE_RADIUS_M * Math.cos(lat));
  return [lat / DEG, lng / DEG];
}

/** [lat, lng] a metros de la grilla sinusoidal: x = R·lon·cos(lat), y = R·lat */
export function latLngToSinusoidal([lat, lng]: LatLng): [number, number] {
  const phi = lat * DEG;
  return [MODIS_SPHERE_RADIUS_M * lng * DEG * Math.cos(phi), MODIS_SPHERE_RADIUS_M * phi];
}

/** anillo exterior cerrado y antihorario, como lo pide el parámetro polygon de CMR */
export function cmrPolygon(geometry: PolygonGeometry): string {
  const ring: number[][] = [];
  for (const p of geometry.coordinates[0] ?? []) {
    const last = ring.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) ring.push([p[0], p[1]]);
  }
  const first = ring[0];
  const last = ring.at(-1);
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([...first]);
  if (signedArea(ring) < 0) ring.reverse();
  return ring.map(([lng, lat]) => `${round(lng, 6)},${round(lat, 6)}`).join(',');
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** firma corta de una geometría para usar en claves */
export function geometryKey(geometry: PolygonGeometry): string {
  return geometry.coordinates
    .map((ring) => ring.map(([lng, lat]) => `${round(lng, 5)},${round(lat, 5)}`).join(';'))
    .join('|');
}

/** parte de un píxel que cae dentro del lote */
export interface CellOverlap {
  /** superficie del píxel dentro del lote, en hectáreas (sin los huecos del lote) */
  areaHa: number;
  /**
   * anillos [lat, lng] para dibujar: primero el pedazo del contorno del lote dentro del píxel y
   * después los pedazos de los huecos. Vacío si el píxel no toca el lote
   */
  rings: LatLng[][];
}

type XY = [number, number];

/** área con signo en m² de un anillo en metros */
function planarArea(ring: XY[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

/**
 * recorte de Sutherland-Hodgman de un anillo cualquiera contra un polígono convexo antihorario.
 * Si el anillo es cóncavo puede dejar bordes de ida y vuelta sobre el contorno del convexo; no
 * cambian el área ni se ven en el mapa
 */
function clipToConvex(subject: XY[], clip: XY[]): XY[] {
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i++) {
    const [ax, ay] = clip[i];
    const [bx, by] = clip[(i + 1) % clip.length];
    const side = ([x, y]: XY) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const cross = (p: XY, q: XY): XY => {
      const sp = side(p);
      const t = sp / (sp - side(q));
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    };
    const input = output;
    output = [];
    for (let k = 0; k < input.length; k++) {
      const current = input[k];
      const previous = input[(k + input.length - 1) % input.length];
      const inCurrent = side(current) >= 0;
      const inPrevious = side(previous) >= 0;
      if (inCurrent) {
        if (!inPrevious) output.push(cross(previous, current));
        output.push(current);
      } else if (inPrevious) {
        output.push(cross(previous, current));
      }
    }
  }
  return output;
}

/** anillo GeoJSON [lng, lat] a metros sinusoidales, sin el punto de cierre repetido */
function toSinusoidal(ring: number[][]): XY[] {
  const points = ring.map(([lng, lat]) => latLngToSinusoidal([lat, lng]));
  const first = points[0];
  const last = points.at(-1);
  if (points.length > 1 && first[0] === last![0] && first[1] === last![1]) points.pop();
  return points;
}

/**
 * qué parte del píxel cae dentro del lote. Se calcula en metros de la grilla sinusoidal de MODIS,
 * que es de área igual: el área sale en hectáreas reales y el píxel ahí es un cuadrilátero convexo
 */
export function cellOverlap(cell: LatLng[], geometry: PolygonGeometry): CellOverlap {
  const empty: CellOverlap = { areaHa: 0, rings: [] };
  const [outer, ...holes] = geometry.coordinates;
  if (!outer || outer.length < 3 || cell.length < 3) return empty;
  let clip = cell.map(latLngToSinusoidal);
  if (planarArea(clip) < 0) clip = [...clip].reverse();

  const xs = clip.map((p) => p[0]);
  const ys = clip.map((p) => p[1]);
  const lot = toSinusoidal(outer);
  if (
    Math.max(...lot.map((p) => p[0])) < Math.min(...xs) ||
    Math.min(...lot.map((p) => p[0])) > Math.max(...xs) ||
    Math.max(...lot.map((p) => p[1])) < Math.min(...ys) ||
    Math.min(...lot.map((p) => p[1])) > Math.max(...ys)
  ) {
    return empty;
  }

  const piece = clipToConvex(lot, clip);
  let areaM2 = Math.abs(planarArea(piece));
  if (piece.length < 3 || areaM2 < 1) return empty;
  const holePieces = holes
    .map((hole) => clipToConvex(toSinusoidal(hole), clip))
    .filter((h) => h.length >= 3);
  for (const h of holePieces) areaM2 -= Math.abs(planarArea(h));
  // menos de 1 m² es resto de redondeo (por ejemplo, un hueco que tapa el píxel entero)
  if (areaM2 < 1) return empty;

  const toLatLng = (ring: XY[]) => ring.map(([x, y]) => sinusoidalToLatLng(x, y));
  return { areaHa: areaM2 / 10_000, rings: [piece, ...holePieces].map(toLatLng) };
}
