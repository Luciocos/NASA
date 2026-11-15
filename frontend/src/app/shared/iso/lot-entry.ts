import {
  FlatRing,
  dominantAngle,
  flatSignedArea,
  flattenRing,
  interiorPoint,
  pointInFlatRings,
} from './geometry';
import { IsoLot, IsoRing } from './model';
import { hashString, mulberry32 } from './prng';

/** hileras de una textura ya recortadas al polígono, en metros locales */
export interface RowSet {
  /** separación con la que se armó, o -1 si todavía no se armó */
  spacing: number;
  angle: number;
  /** cantidad de tramos */
  count: number;
  /** [x0, y0, x1, y1] por tramo */
  segs: Float32Array;
  /** número de hilera de cada tramo: da variedad estable a lo que se dibuja sobre ella */
  rows: Int32Array;
}

/**
 * estado que el motor guarda de cada lote entre cuadros: geometría preparada, cachés de
 * textura, animaciones y lo que calculó la última pasada de layout
 */
export interface LotEntry {
  id: string;
  lot: IsoLot;
  /** identidad del array de anillos con el que se preparó la geometría */
  source: readonly IsoRing[];
  seed: number;
  /** anillos aplanados en metros: el exterior en sentido antihorario y los huecos en horario */
  rings: Float64Array[];
  /** los mismos anillos proyectados al suelo en el cuadro actual, en px */
  screen: Float32Array[];
  area: number;
  /** punto interior donde se anclan el marcador y el rótulo */
  anchorX: number;
  anchorY: number;
  /** dirección de las hileras */
  angle: number;
  mainRows: RowSet;
  auxRowsA: RowSet;
  auxRowsB: RowSet;
  /** puntos interiores al azar [x, y, azar] para salpicar detalle; se arman al primer uso */
  scatter: Float32Array | null;
  /** manchas irregulares [x, y] por vértice, BLOTCH_POINTS vértices por mancha */
  blotches: Float32Array | null;

  labelText: string;
  labelWidth: number;
  sublabelText: string;
  sublabelWidth: number;

  /** momento en que empieza a subir desde el suelo, en ms del reloj del cuadro */
  bornAt: number;
  rise: number;
  lift: number;

  // layout del último cuadro
  seenIn: number;
  visible: boolean;
  minSx: number;
  minSy: number;
  maxSx: number;
  maxSy: number;
  /** lado en px de un cuadrado con la misma superficie en pantalla */
  size: number;
  height: number;
  depth: number;
  /** ancla sobre la cara superior, en px */
  ax: number;
  ay: number;
  /** centro y radio del globo del marcador; radio 0 si no se dibuja */
  markerX: number;
  markerY: number;
  markerR: number;
}

export const BLOTCH_POINTS = 11;
const SCATTER_POINTS = 56;
const MAX_ROWS = 700;

function emptyRows(): RowSet {
  return { spacing: -1, angle: 0, count: 0, segs: new Float32Array(0), rows: new Int32Array(0) };
}

export function createEntry(lot: IsoLot): LotEntry {
  const entry: LotEntry = {
    id: lot.id,
    lot,
    source: lot.rings,
    seed: hashString(lot.id),
    rings: [],
    screen: [],
    area: 0,
    anchorX: 0,
    anchorY: 0,
    angle: 0,
    mainRows: emptyRows(),
    auxRowsA: emptyRows(),
    auxRowsB: emptyRows(),
    scatter: null,
    blotches: null,
    labelText: '',
    labelWidth: -1,
    sublabelText: '',
    sublabelWidth: -1,
    bornAt: 0,
    rise: 1,
    lift: 0,
    seenIn: 0,
    visible: false,
    minSx: 0,
    minSy: 0,
    maxSx: 0,
    maxSy: 0,
    size: 0,
    height: 0,
    depth: 0,
    ax: 0,
    ay: 0,
    markerX: 0,
    markerY: 0,
    markerR: 0,
  };
  prepareGeometry(entry, lot.rings);
  return entry;
}

/** prepara todo lo que depende de la forma del lote. se llama cuando cambia `lot.rings` */
export function prepareGeometry(entry: LotEntry, rings: readonly IsoRing[]): void {
  entry.source = rings;
  entry.rings = [];
  entry.screen = [];
  let area = 0;
  for (const ring of rings) {
    const flat = flattenRing(ring);
    if (flat.length < 6) continue;
    const signed = flatSignedArea(flat);
    // sentido de giro fijo: con el exterior antihorario y los huecos al revés, un lateral se
    // ve si su borde avanza hacia la derecha en pantalla, y el relleno no necesita par-impar
    const wantPositive = entry.rings.length === 0;
    if (signed > 0 !== wantPositive) reverseRing(flat);
    area += wantPositive ? Math.abs(signed) : -Math.abs(signed);
    entry.rings.push(flat);
    entry.screen.push(new Float32Array(flat.length));
  }
  entry.area = Math.max(0, area);
  const anchor = interiorPoint(rings);
  entry.anchorX = anchor[0];
  entry.anchorY = anchor[1];
  entry.angle = rings.length > 0 ? dominantAngle(rings[0]) : 0;
  entry.mainRows.spacing = -1;
  entry.auxRowsA.spacing = -1;
  entry.auxRowsB.spacing = -1;
  entry.scatter = null;
  entry.blotches = null;
}

function reverseRing(flat: Float64Array): void {
  for (let i = 0, j = flat.length - 2; i < j; i += 2, j -= 2) {
    const x = flat[i];
    const y = flat[i + 1];
    flat[i] = flat[j];
    flat[i + 1] = flat[j + 1];
    flat[j] = x;
    flat[j + 1] = y;
  }
}

/**
 * arma las hileras paralelas a `angle`, separadas `spacing` metros, recortadas al polígono
 * (huecos incluidos) y acortadas `inset` metros en cada punta. no se dibuja ninguna a menos de
 * `sideMargin` metros de los costados
 *
 * con `anchored` las hileras pasan por múltiplos de `spacing` desde el origen del mundo (la
 * cuadrícula de un borrador); si no, se reparten desde el medio del lote, y al dividir la
 * separación por dos las hileras anteriores quedan en su lugar
 */
export function buildRows(
  entry: LotEntry,
  set: RowSet,
  angle: number,
  spacing: number,
  anchored: boolean,
  inset: number,
  sideMargin: number,
): void {
  set.spacing = spacing;
  set.angle = angle;
  set.count = 0;
  const outer = entry.rings[0];
  if (!outer || !(spacing > 0)) return;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const nx = -sin;
  const ny = cos;
  let nMin = Infinity;
  let nMax = -Infinity;
  for (let i = 0; i < outer.length; i += 2) {
    const n = outer[i] * nx + outer[i + 1] * ny;
    if (n < nMin) nMin = n;
    if (n > nMax) nMax = n;
  }
  const ref = anchored ? 0 : (nMin + nMax) / 2;
  const first = Math.ceil((nMin + sideMargin - ref) / spacing);
  const last = Math.floor((nMax - sideMargin - ref) / spacing);
  const rowCount = last - first + 1;
  if (rowCount <= 0 || rowCount > MAX_ROWS) return;

  const hits: number[][] = [];
  for (let k = 0; k < rowCount; k++) hits.push([]);
  for (const flat of entry.rings) {
    const count = flat.length;
    for (let i = 0, j = count - 2; i < count; j = i, i += 2) {
      const n0 = flat[j] * nx + flat[j + 1] * ny;
      const n1 = flat[i] * nx + flat[i + 1] * ny;
      if (n0 === n1) continue;
      const d0 = flat[j] * cos + flat[j + 1] * sin;
      const d1 = flat[i] * cos + flat[i + 1] * sin;
      const low = Math.min(n0, n1);
      const high = Math.max(n0, n1);
      // regla semiabierta: un vértice que cae justo sobre una hilera se cuenta una sola vez
      for (let k = Math.max(first, Math.ceil((low - ref) / spacing)); k <= last; k++) {
        const n = ref + k * spacing;
        if (n >= high) break;
        hits[k - first].push(d0 + ((n - n0) / (n1 - n0)) * (d1 - d0));
      }
    }
  }

  let total = 0;
  for (const row of hits) {
    row.sort(ascending);
    for (let h = 0; h + 1 < row.length; h += 2) {
      if (row[h + 1] - row[h] > inset * 2) total++;
    }
  }
  if (set.segs.length < total * 4) {
    set.segs = new Float32Array(total * 4);
    set.rows = new Int32Array(total);
  }
  let out = 0;
  for (let k = 0; k < rowCount; k++) {
    const row = hits[k];
    const n = ref + (first + k) * spacing;
    for (let h = 0; h + 1 < row.length; h += 2) {
      const from = row[h] + inset;
      const to = row[h + 1] - inset;
      if (to <= from) continue;
      set.segs[out * 4] = cos * from + nx * n;
      set.segs[out * 4 + 1] = sin * from + ny * n;
      set.segs[out * 4 + 2] = cos * to + nx * n;
      set.segs[out * 4 + 3] = sin * to + ny * n;
      set.rows[out] = first + k;
      out++;
    }
  }
  set.count = out;
}

function ascending(a: number, b: number): number {
  return a - b;
}

/** puntos interiores al azar, siempre los mismos para el mismo lote */
export function scatterOf(entry: LotEntry): Float32Array {
  if (entry.scatter) return entry.scatter;
  const points = new Float32Array(SCATTER_POINTS * 3);
  const outer = entry.rings[0];
  let found = 0;
  if (outer) {
    const box = boxOf(outer);
    const random = mulberry32(entry.seed ^ 0x9e3779b9);
    const rings: readonly FlatRing[] = entry.rings;
    for (let tries = 0; tries < SCATTER_POINTS * 24 && found < SCATTER_POINTS; tries++) {
      const x = box[0] + random() * (box[2] - box[0]);
      const y = box[1] + random() * (box[3] - box[1]);
      const extra = random();
      if (!pointInFlatRings(rings, x, y)) continue;
      points[found * 3] = x;
      points[found * 3 + 1] = y;
      points[found * 3 + 2] = extra;
      found++;
    }
  }
  entry.scatter = found === SCATTER_POINTS ? points : points.slice(0, found * 3);
  return entry.scatter;
}

/** manchas irregulares repartidas por el lote, siempre las mismas para el mismo lote */
export function blotchesOf(entry: LotEntry): Float32Array {
  if (entry.blotches) return entry.blotches;
  const scatter = scatterOf(entry);
  const available = scatter.length / 3;
  const random = mulberry32(entry.seed ^ 0x51ed270b);
  const count = Math.min(available, 6 + Math.floor(random() * 4));
  const blotches = new Float32Array(count * BLOTCH_POINTS * 2);
  const reach = Math.sqrt(entry.area);
  for (let b = 0; b < count; b++) {
    const cx = scatter[b * 3];
    const cy = scatter[b * 3 + 1];
    const radius = reach * (0.09 + random() * 0.15);
    const turn = random() * Math.PI * 2;
    for (let p = 0; p < BLOTCH_POINTS; p++) {
      const angle = turn + (p / BLOTCH_POINTS) * Math.PI * 2;
      const r = radius * (0.55 + random() * 0.6);
      blotches[(b * BLOTCH_POINTS + p) * 2] = cx + Math.cos(angle) * r;
      blotches[(b * BLOTCH_POINTS + p) * 2 + 1] = cy + Math.sin(angle) * r;
    }
  }
  entry.blotches = blotches;
  return blotches;
}

function boxOf(flat: Float64Array): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    if (flat[i] < minX) minX = flat[i];
    if (flat[i] > maxX) maxX = flat[i];
    if (flat[i + 1] < minY) minY = flat[i + 1];
    if (flat[i + 1] > maxY) maxY = flat[i + 1];
  }
  return [minX, minY, maxX, maxY];
}
