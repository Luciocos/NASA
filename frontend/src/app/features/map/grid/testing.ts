import { CellSet, ReadonlyCellSet } from './cell-set';
import { Cell, GridVertex } from './hectare-grid';
import { isSingleRegion } from './regions';

/*
 * ayudas para las pruebas de la grilla: formas dibujadas con texto y regiones al azar con semilla.
 * nada de esto se usa en la aplicación
 */

const SIDES: readonly Cell[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * celdas a partir de un dibujo: cada texto es una fila y "#" es una celda pintada. la última fila
 * es j = 0 y el primer carácter es i = 0, así el dibujo se lee con el norte arriba
 */
export function cellsFromArt(rows: readonly string[]): CellSet {
  const cells = new CellSet();
  rows.forEach((row, index) => {
    const j = rows.length - 1 - index;
    [...row].forEach((char, i) => {
      if (char === '#') cells.addAt(i, j);
    });
  });
  return cells;
}

/** claves "i,j" ordenadas, para comparar conjuntos de celdas con un mensaje de error legible */
export function sortedKeys(cells: Iterable<Cell>): string[] {
  return [...cells].map(([i, j]) => `${i},${j}`).sort();
}

/** generador de números al azar con semilla (mulberry32): cada corrida da la misma secuencia */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomRegionOptions {
  /** celdas a las que llega el crecimiento, antes del borrado */
  size: number;
  /**
   * de 0 a 1: con 0 crece desde cualquier celda (manchas compactas) y cerca de 1 crece casi
   * siempre desde las últimas (formas con brazos, que encierran huecos al cruzarse)
   */
  stringiness?: number;
  /** intentos de borrado, como fracción de size. cada borrado conserva una sola región */
  erosion?: number;
}

/**
 * región al azar de celdas unidas por un lado: crecimiento aleatorio desde [0, 0] y después
 * borrado de celdas al azar que no la partan. el borrado es lo que deja huecos y pellizcos
 */
export function randomRegion(random: () => number, options: RandomRegionOptions): CellSet {
  const { size, stringiness = 0, erosion = 0.3 } = options;
  const cells = new CellSet([[0, 0]]);
  const order: Cell[] = [[0, 0]];
  while (cells.size < size) {
    const recent = random() < stringiness;
    const from = recent
      ? order.length - 1 - Math.floor(random() * Math.min(3, order.length))
      : Math.floor(random() * order.length);
    const [i, j] = order[from];
    const [di, dj] = SIDES[Math.floor(random() * 4)];
    if (cells.addAt(i + di, j + dj)) order.push([i + di, j + dj]);
  }
  const attempts = Math.floor(size * erosion);
  for (let k = 0; k < attempts && cells.size > 1; k++) {
    const [i, j] = order[Math.floor(random() * order.length)];
    if (!cells.deleteAt(i, j)) continue;
    if (!isSingleRegion(cells)) cells.addAt(i, j);
  }
  return cells;
}

/**
 * vértices "pellizco": aquellos donde dos celdas pintadas se tocan solo en diagonal (las otras
 * dos celdas del vértice están sin pintar)
 */
export function pinchVertices(cells: ReadonlyCellSet): GridVertex[] {
  const pinches: GridVertex[] = [];
  cells.forEach((i, j) => {
    // cada pellizco se encuentra una vez, desde la celda de abajo
    if (cells.hasAt(i + 1, j + 1) && !cells.hasAt(i + 1, j) && !cells.hasAt(i, j + 1)) {
      pinches.push([i + 1, j + 1]);
    }
    if (cells.hasAt(i - 1, j + 1) && !cells.hasAt(i - 1, j) && !cells.hasAt(i, j + 1)) {
      pinches.push([i, j + 1]);
    }
  });
  return pinches;
}

/**
 * cantidad de zonas sin pintar que quedan encerradas, contando como unidas solo las celdas que
 * comparten un lado. es un cálculo independiente del trazado de contornos, para contrastarlo
 */
export function enclosedBackgroundCount(cells: ReadonlyCellSet): number {
  const box = cells.bounds();
  if (!box) return 0;
  // un margen de una celda alrededor de la caja deja todo el fondo de afuera unido
  const minI = box.minI - 1;
  const maxI = box.maxI + 1;
  const minJ = box.minJ - 1;
  const maxJ = box.maxJ + 1;
  const seen = new CellSet();
  const fill = (startI: number, startJ: number) => {
    seen.addAt(startI, startJ);
    const pending = [startI, startJ];
    while (pending.length > 0) {
      const j = pending.pop()!;
      const i = pending.pop()!;
      for (const [di, dj] of SIDES) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < minI || ni > maxI || nj < minJ || nj > maxJ) continue;
        if (!cells.hasAt(ni, nj) && seen.addAt(ni, nj)) pending.push(ni, nj);
      }
    }
  };
  fill(minI, minJ);
  let enclosed = 0;
  for (let j = minJ; j <= maxJ; j++) {
    for (let i = minI; i <= maxI; i++) {
      if (cells.hasAt(i, j) || seen.hasAt(i, j)) continue;
      fill(i, j);
      enclosed++;
    }
  }
  return enclosed;
}

/**
 * todos los vértices de la grilla por los que pasa un anillo, de a un paso de celda. el anillo
 * viene solo con sus esquinas, como lo devuelve traceRings
 *
 * @throws Error si algún tramo no es horizontal ni vertical
 */
export function ringSteps(ring: readonly GridVertex[]): GridVertex[] {
  const steps: GridVertex[] = [];
  ring.forEach(([x1, y1], k) => {
    const [x2, y2] = ring[(k + 1) % ring.length];
    if (x1 !== x2 && y1 !== y2) throw new Error(`tramo en diagonal: ${x1},${y1} a ${x2},${y2}`);
    const length = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    const stepX = Math.sign(x2 - x1);
    const stepY = Math.sign(y2 - y1);
    for (let n = 0; n < length; n++) steps.push([x1 + n * stepX, y1 + n * stepY]);
  });
  return steps;
}
