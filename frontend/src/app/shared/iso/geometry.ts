import { IsoPoint, IsoRing } from './model';

/** caja alineada a los ejes, en metros locales */
export interface IsoBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** anillo aplanado [x0, y0, x1, y1, ...]: es la forma que usa el motor en sus bucles */
export type FlatRing = ArrayLike<number>;

/** pasa un anillo a su forma aplanada. tolera el punto de cierre repetido de geojson */
export function flattenRing(ring: IsoRing): Float64Array {
  let count = ring.length;
  if (count > 1) {
    const first = ring[0];
    const last = ring[count - 1];
    if (first[0] === last[0] && first[1] === last[1]) count--;
  }
  const flat = new Float64Array(count * 2);
  for (let i = 0; i < count; i++) {
    flat[i * 2] = ring[i][0];
    flat[i * 2 + 1] = ring[i][1];
  }
  return flat;
}

/**
 * superficie con signo de un anillo aplanado (fórmula de gauss): positiva si gira en sentido
 * antihorario con el eje y hacia arriba
 */
export function flatSignedArea(flat: FlatRing): number {
  const n = flat.length;
  let twice = 0;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    twice += flat[j] * flat[i + 1] - flat[i] * flat[j + 1];
  }
  return twice / 2;
}

/** superficie con signo de un anillo, en metros cuadrados */
export function ringSignedArea(ring: IsoRing): number {
  return flatSignedArea(flattenRing(ring));
}

/** superficie de un polígono en metros cuadrados: el exterior menos los huecos */
export function polygonArea(rings: readonly IsoRing[]): number {
  let area = 0;
  for (let r = 0; r < rings.length; r++) {
    const ringArea = Math.abs(ringSignedArea(rings[r]));
    area += r === 0 ? ringArea : -ringArea;
  }
  return Math.max(0, area);
}

/** caja que contiene a todos los anillos, o null si no hay ningún punto */
export function boundsOf(rings: Iterable<IsoRing>): IsoBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return minX > maxX ? null : { minX, minY, maxX, maxY };
}

/**
 * centroide de área de un polígono con huecos. no depende del sentido de giro. si el polígono
 * no tiene superficie devuelve el promedio de los vértices del exterior
 *
 * en un polígono cóncavo o con huecos puede caer fuera: para ubicar un rótulo usar interiorPoint
 */
export function centroidOf(rings: readonly IsoRing[]): IsoPoint {
  let sumArea = 0;
  let sumX = 0;
  let sumY = 0;
  for (let r = 0; r < rings.length; r++) {
    const flat = flattenRing(rings[r]);
    const n = flat.length;
    let twice = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const cross = flat[j] * flat[i + 1] - flat[i] * flat[j + 1];
      twice += cross;
      cx += (flat[j] + flat[i]) * cross;
      cy += (flat[j + 1] + flat[i + 1]) * cross;
    }
    if (twice === 0) continue;
    // el centroide de cada anillo se pesa con su superficie: suma el exterior y restan los huecos
    const weight = (r === 0 ? 1 : -1) * Math.abs(twice / 2);
    sumArea += weight;
    sumX += (cx / (3 * twice)) * weight;
    sumY += (cy / (3 * twice)) * weight;
  }
  if (sumArea > 0) return [sumX / sumArea, sumY / sumArea];
  const outer = rings[0] ?? [];
  if (outer.length === 0) return [0, 0];
  let meanX = 0;
  let meanY = 0;
  for (const [x, y] of outer) {
    meanX += x;
    meanY += y;
  }
  return [meanX / outer.length, meanY / outer.length];
}

/** true si el punto cae dentro de alguno de los anillos una cantidad impar de veces */
export function pointInFlatRings(rings: readonly FlatRing[], x: number, y: number): boolean {
  let inside = false;
  for (const flat of rings) {
    const n = flat.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const yi = flat[i + 1];
      const yj = flat[j + 1];
      if (yi > y !== yj > y && x < ((flat[j] - flat[i]) * (y - yi)) / (yj - yi) + flat[i]) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * true si el tramo vertical que va de (x, y0) a (x, y1) cruza el borde de algún anillo. el
 * motor lo usa para saber si un punto de la pantalla cae sobre un lateral del bloque
 */
export function verticalSegmentCrossesFlatRings(
  rings: readonly FlatRing[],
  x: number,
  y0: number,
  y1: number,
): boolean {
  const low = Math.min(y0, y1);
  const high = Math.max(y0, y1);
  for (const flat of rings) {
    const n = flat.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = flat[i];
      const xj = flat[j];
      if (xi > x === xj > x) continue;
      const cross = flat[i + 1] + ((x - xi) / (xj - xi)) * (flat[j + 1] - flat[i + 1]);
      if (cross >= low && cross <= high) return true;
    }
  }
  return false;
}

/** punto dentro de un polígono con huecos, por la regla par-impar */
export function pointInPolygon(rings: readonly IsoRing[], x: number, y: number): boolean {
  return pointInFlatRings(rings.map(flattenRing), x, y);
}

const ANGLE_BINS = 36;

/**
 * ángulo del lado dominante de un anillo, en radianes dentro de [0, π): la dirección que suma
 * más largo de lados. orienta las hileras de la textura, como se siembra un lote real
 *
 * junta los lados en franjas de 5° para que un borde con muchos vértices casi alineados pese
 * como un solo lado
 */
export function dominantAngle(ring: IsoRing): number {
  const flat = flattenRing(ring);
  const n = flat.length;
  const bins = new Float64Array(ANGLE_BINS);
  const angles: number[] = [];
  const lengths: number[] = [];
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const dx = flat[i] - flat[j];
    const dy = flat[i + 1] - flat[j + 1];
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI;
    if (angle >= Math.PI) angle -= Math.PI;
    angles.push(angle);
    lengths.push(length);
    bins[Math.min(ANGLE_BINS - 1, Math.floor((angle / Math.PI) * ANGLE_BINS))] += length;
  }
  if (angles.length === 0) return 0;

  let best = 0;
  let bestWeight = -1;
  for (let b = 0; b < ANGLE_BINS; b++) {
    // cada franja suma la mitad de sus vecinas: un lado justo en el límite no se reparte en dos
    const weight =
      bins[b] + 0.5 * (bins[(b + 1) % ANGLE_BINS] + bins[(b + ANGLE_BINS - 1) % ANGLE_BINS]);
    if (weight > bestWeight + 1e-9) {
      bestWeight = weight;
      best = b;
    }
  }

  // promedio de los lados cercanos a la franja ganadora, con el ángulo doblado para que 179° y
  // 1° se promedien como vecinos
  const center = ((best + 0.5) / ANGLE_BINS) * Math.PI;
  const tolerance = (1.5 / ANGLE_BINS) * Math.PI;
  let sumSin = 0;
  let sumCos = 0;
  for (let k = 0; k < angles.length; k++) {
    let delta = Math.abs(angles[k] - center);
    if (delta > Math.PI / 2) delta = Math.PI - delta;
    if (delta > tolerance) continue;
    sumSin += Math.sin(2 * angles[k]) * lengths[k];
    sumCos += Math.cos(2 * angles[k]) * lengths[k];
  }
  let mean = Math.atan2(sumSin, sumCos) / 2;
  if (mean < 0) mean += Math.PI;
  // un valor apenas por debajo de π es la misma dirección que 0
  return mean >= Math.PI - 1e-9 ? 0 : mean;
}

/**
 * punto que seguro cae dentro del polígono, para anclar el rótulo y el marcador: el centroide
 * si está adentro, y si no (polígono cóncavo o con hueco en el medio) el medio del tramo
 * interior más ancho sobre la horizontal del centroide
 */
export function interiorPoint(rings: readonly IsoRing[]): IsoPoint {
  const flats = rings.map(flattenRing);
  const centroid = centroidOf(rings);
  if (flats.length === 0 || flats[0].length < 6) return centroid;
  if (pointInFlatRings(flats, centroid[0], centroid[1])) return centroid;

  const bounds = boundsOf(rings);
  if (!bounds) return centroid;
  const height = bounds.maxY - bounds.minY;
  // primero la horizontal del centroide; si no corta al polígono, otras alturas de la caja
  const candidates = [centroid[1], bounds.minY + height * 0.5, bounds.minY + height * 0.25];
  candidates.push(bounds.minY + height * 0.75);
  for (const y of candidates) {
    const span = widestSpan(flats, y);
    if (span) return [(span[0] + span[1]) / 2, y];
  }
  return [flats[0][0], flats[0][1]];
}

/** tramo interior más ancho de la horizontal `y`, como [x inicial, x final], o null si no hay */
function widestSpan(flats: readonly FlatRing[], y: number): [number, number] | null {
  const crossings: number[] = [];
  for (const flat of flats) {
    const n = flat.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const yi = flat[i + 1];
      const yj = flat[j + 1];
      if (yi > y === yj > y) continue;
      crossings.push(flat[i] + ((y - yi) / (yj - yi)) * (flat[j] - flat[i]));
    }
  }
  crossings.sort((a, b) => a - b);
  let best: [number, number] | null = null;
  for (let k = 0; k + 1 < crossings.length; k += 2) {
    if (!best || crossings[k + 1] - crossings[k] > best[1] - best[0]) {
      best = [crossings[k], crossings[k + 1]];
    }
  }
  return best && best[1] > best[0] ? best : null;
}
