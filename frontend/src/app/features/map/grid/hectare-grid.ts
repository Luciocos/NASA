import {
  LatLngBox,
  LatLngTuple,
  LocalFrame,
  XY,
  createLocalFrame,
} from '../../../core/geo/local-frame';

/** lado de una celda de una hectárea, en metros */
export const HECTARE_CELL_M = 100;
/** lado de una celda de un cuarto de hectárea, en metros */
export const QUARTER_HECTARE_CELL_M = 50;

/**
 * grilla de celdas cuadradas apoyada en un marco local: la celda [i, j] ocupa de `i * cellSize`
 * a `(i + 1) * cellSize` sobre el eje x local y de `j * cellSize` a `(j + 1) * cellSize` sobre el y
 *
 * la rotación de la grilla es la del marco. una celda mide lo que dice `cellSize` solo cerca del
 * origen del marco (ver createLocalFrame): hay que crearla donde el usuario va a pintar
 */
export interface HectareGrid {
  readonly frame: LocalFrame;
  /** lado de la celda en metros: 100 para una hectárea, 50 para un cuarto */
  readonly cellSize: number;
}

/** celda de la grilla: [i, j] enteros, i sobre el eje x local y j sobre el eje y local */
export type Cell = readonly [number, number];

/**
 * vértice de la grilla: [i, j] enteros. el vértice [i, j] es la esquina inferior izquierda de la
 * celda [i, j], en `[i * cellSize, j * cellSize]` metros locales
 */
export type GridVertex = readonly [number, number];

/** rango de celdas con los cuatro extremos incluidos */
export interface CellRange {
  minI: number;
  maxI: number;
  minJ: number;
  maxJ: number;
}

export interface HectareGridOptions {
  /** lado de la celda en metros. por defecto 100 (una hectárea) */
  cellSize?: number;
  /** giro antihorario de la grilla respecto de este y norte, en grados. por defecto 0 */
  rotationDeg?: number;
}

/**
 * arma una grilla con origen en `origin` ([lat, lng]): ese punto queda en la esquina que
 * comparten las celdas [0, 0], [-1, 0], [0, -1] y [-1, -1], y la grilla gira alrededor de él
 *
 * @example
 * const grid = createHectareGrid([-33.05, -61.2], { rotationDeg: 45 });
 * const cell = cellAt(grid, [e.latlng.lat, e.latlng.lng]);
 *
 * @throws RangeError si el tamaño de celda no es un número positivo o el origen no sirve
 */
export function createHectareGrid(
  origin: Readonly<LatLngTuple>,
  options: HectareGridOptions = {},
): HectareGrid {
  const cellSize = options.cellSize ?? HECTARE_CELL_M;
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new RangeError(`tamaño de celda inválido: ${cellSize}`);
  }
  return { frame: createLocalFrame(origin, options.rotationDeg ?? 0), cellSize };
}

/** clave de texto de una celda ("i,j"), para usar en un Map o como track de un @for */
export function cellKey(cell: Cell): string {
  return `${cell[0]},${cell[1]}`;
}

/**
 * celda a partir de su clave de texto
 *
 * @throws RangeError si la clave no tiene la forma "i,j" con dos enteros
 */
export function parseKey(key: string): Cell {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) throw new RangeError(`clave de celda inválida: "${key}"`);
  // el + 0 convierte un -0 ("-0,3") en 0
  return [Number(match[1]) + 0, Number(match[2]) + 0];
}

/** celda que contiene a un punto [lat, lng]. los bordes inferior e izquierdo son de la celda */
export function cellAt(grid: HectareGrid, latlng: Readonly<LatLngTuple>): Cell {
  const [x, y] = grid.frame.toLocal(latlng);
  return [cellIndex(x, grid.cellSize), cellIndex(y, grid.cellSize)];
}

/** las 4 esquinas de una celda en metros locales, en sentido antihorario desde la inferior izquierda */
export function cellCornersLocal(grid: HectareGrid, cell: Cell): XY[] {
  const x = cell[0] * grid.cellSize;
  const y = cell[1] * grid.cellSize;
  const size = grid.cellSize;
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ];
}

/** las 4 esquinas de una celda en [lat, lng], en sentido antihorario: sirven para un L.polygon */
export function cellCornersLatLng(grid: HectareGrid, cell: Cell): LatLngTuple[] {
  return cellCornersLocal(grid, cell).map((corner) => grid.frame.toLatLng(corner));
}

/** centro de una celda en metros locales */
export function cellCenterLocal(grid: HectareGrid, cell: Cell): XY {
  return [(cell[0] + 0.5) * grid.cellSize, (cell[1] + 0.5) * grid.cellSize];
}

/** centro de una celda en [lat, lng] */
export function cellCenterLatLng(grid: HectareGrid, cell: Cell): LatLngTuple {
  return grid.frame.toLatLng(cellCenterLocal(grid, cell));
}

/** posición [lat, lng] de un vértice de la grilla: para dibujar las líneas y los contornos */
export function vertexLatLng(grid: HectareGrid, vertex: GridVertex): LatLngTuple {
  return grid.frame.toLatLng([vertex[0] * grid.cellSize, vertex[1] * grid.cellSize]);
}

/**
 * rango de celdas que cubre una caja lat/lng, para dibujar solo lo que se ve
 *
 * con la grilla rotada la caja queda inclinada respecto de las celdas, así que el rango incluye
 * también celdas de las esquinas que no se ven: nunca falta ninguna de las que sí se ven.
 * `padding` suma celdas de margen por lado
 *
 * @example
 * const b = map.getBounds();
 * const range = visibleCellRange(grid, [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]);
 * if (rangeCellCount(range) > 20_000) return; // muy lejos: no vale la pena dibujar la grilla
 */
export function visibleCellRange(
  grid: HectareGrid,
  bounds: Readonly<LatLngBox>,
  padding = 0,
): CellRange {
  const [[south, west], [north, east]] = bounds;
  const corners: LatLngTuple[] = [
    [south, west],
    [south, east],
    [north, east],
    [north, west],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const corner of corners) {
    const [x, y] = grid.frame.toLocal(corner);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    minI: cellIndex(minX, grid.cellSize) - padding,
    maxI: cellIndex(maxX, grid.cellSize) + padding,
    minJ: cellIndex(minY, grid.cellSize) - padding,
    maxJ: cellIndex(maxY, grid.cellSize) + padding,
  };
}

/** cantidad de celdas de un rango: para no dibujar la grilla cuando hay demasiadas a la vista */
export function rangeCellCount(range: Readonly<CellRange>): number {
  return Math.max(0, range.maxI - range.minI + 1) * Math.max(0, range.maxJ - range.minJ + 1);
}

// índice de la celda que contiene a una coordenada local. el + 0 convierte un -0 en 0, que si no
// se cuela en las claves y en las comparaciones
function cellIndex(meters: number, cellSize: number): number {
  return Math.floor(meters / cellSize) + 0;
}
