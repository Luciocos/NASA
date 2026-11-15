import { PolygonGeometry } from '../../../core/models';
import {
  Cell,
  CellSet,
  GridEditor,
  HECTARE_CELL_M,
  HectareGrid,
  LatLngTuple,
  QUARTER_HECTARE_CELL_M,
  ReadonlyCellSet,
  StrokeMode,
  cellAt,
  cellsAreaHa,
  cellsPerimeterM,
  cellsToGeometry,
  components,
  createHectareGrid,
  isValidCell,
  regridCells,
} from '../grid';

/** lado del recuadro: una hectárea (100 m) o un cuarto de hectárea (50 m) */
export type PaintCellSize = typeof HECTARE_CELL_M | typeof QUARTER_HECTARE_CELL_M;

export const MIN_ROTATION_DEG = -45;
export const MAX_ROTATION_DEG = 45;

/** foto serializable de lo pintado, para el borrador */
export interface PaintSnapshot {
  origin: LatLngTuple;
  rotationDeg: number;
  cellSize: PaintCellSize;
  /** celdas pintadas como pares i, j seguidos */
  cells: number[];
}

interface GridState {
  grid: HectareGrid;
  editor: GridEditor;
}

/**
 * lo pintado en el modo "pintar hectáreas": la grilla (origen, giro y tamaño) más las celdas
 *
 * el historial es el del GridEditor más los cambios de grilla: girar o cambiar el tamaño pasa lo
 * pintado a la grilla nueva (regridCells) y deshacer vuelve a la grilla anterior con sus celdas
 * tal como estaban, sin perder precisión
 *
 * @example
 * const session = new PaintSession([-33.05, -61.2]);
 * session.beginStroke('paint');
 * session.strokeTo(session.cellAt([lat, lng]));
 * session.endStroke();
 * if (session.regionCount() === 1) api.createLot({ name, geometry: session.geometry() });
 */
export class PaintSession {
  private state: GridState;
  private readonly past: GridState[] = [];
  private future: GridState[] = [];
  // grilla de partida mientras se arrastra el control de giro
  private previewBase: GridState | null = null;

  constructor(
    origin: Readonly<LatLngTuple>,
    options: { rotationDeg?: number; cellSize?: PaintCellSize; cells?: Iterable<Cell> } = {},
  ) {
    this.state = {
      grid: createHectareGrid(origin, {
        cellSize: options.cellSize ?? HECTARE_CELL_M,
        rotationDeg: clampRotation(options.rotationDeg ?? 0),
      }),
      editor: new GridEditor(options.cells),
    };
  }

  /** arma la sesión de un borrador guardado, o null si el borrador no sirve */
  static restore(snapshot: unknown): PaintSession | null {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const { origin, rotationDeg, cellSize, cells } = snapshot as Partial<PaintSnapshot>;
    if (!Array.isArray(origin) || origin.length !== 2 || !origin.every(Number.isFinite)) {
      return null;
    }
    if (cellSize !== HECTARE_CELL_M && cellSize !== QUARTER_HECTARE_CELL_M) return null;
    if (typeof rotationDeg !== 'number' || !Number.isFinite(rotationDeg)) return null;
    if (!Array.isArray(cells) || cells.length % 2 !== 0) return null;
    const list: Cell[] = [];
    for (let k = 0; k < cells.length; k += 2) {
      if (!isValidCell(cells[k], cells[k + 1])) return null;
      list.push([cells[k], cells[k + 1]]);
    }
    try {
      return new PaintSession([origin[0], origin[1]], { rotationDeg, cellSize, cells: list });
    } catch {
      return null;
    }
  }

  get grid(): HectareGrid {
    return this.state.grid;
  }

  /** celdas pintadas: siempre del mismo editor mientras no cambie la grilla */
  get cells(): ReadonlyCellSet {
    return this.state.editor.cells;
  }

  get origin(): LatLngTuple {
    return this.state.grid.frame.origin;
  }

  get rotationDeg(): number {
    return this.state.grid.frame.rotationDeg;
  }

  get cellSize(): PaintCellSize {
    return this.state.grid.cellSize as PaintCellSize;
  }

  get canUndo(): boolean {
    return this.state.editor.canUndo || this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.state.editor.canRedo || this.future.length > 0;
  }

  get stroking(): boolean {
    return this.state.editor.strokeMode !== null;
  }

  cellAt(latlng: Readonly<LatLngTuple>): Cell {
    return cellAt(this.state.grid, latlng);
  }

  beginStroke(mode: StrokeMode): void {
    this.commitGrid();
    this.state.editor.beginStroke(mode);
  }

  /** devuelve true si cambió alguna celda */
  strokeTo(cell: Cell): boolean {
    return this.state.editor.strokeTo(cell);
  }

  /** devuelve true si el trazo cambió algo (y entró al historial) */
  endStroke(): boolean {
    return this.edited(this.state.editor.endStroke());
  }

  /** descarta el trazo en curso, por ejemplo cuando apoyan un segundo dedo para hacer zoom */
  cancelStroke(): void {
    if (this.state.editor.endStroke()) this.state.editor.undo();
  }

  toggle(cell: Cell): boolean {
    this.commitGrid();
    return this.edited(this.state.editor.toggle(cell));
  }

  clear(): boolean {
    this.commitGrid();
    return this.edited(this.state.editor.clear());
  }

  /** deja solo el sector más grande */
  keepLargestRegion(): boolean {
    const [largest, ...rest] = components(this.cells);
    if (!largest || rest.length === 0) return false;
    this.commitGrid();
    return this.edited(this.state.editor.replaceAll(largest));
  }

  undo(): boolean {
    this.commitGrid();
    if (this.state.editor.undo()) return true;
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.state);
    this.state = previous;
    return true;
  }

  redo(): boolean {
    this.commitGrid();
    if (this.state.editor.redo()) return true;
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.state);
    this.state = next;
    return true;
  }

  /**
   * cambia el giro o el tamaño del recuadro y pasa lo pintado a la grilla nueva. mientras se
   * arrastra el control se llama varias veces: siempre parte de la grilla del comienzo y queda
   * como un solo paso del historial cuando se llama a `commitGrid()` (o a cualquier edición)
   */
  previewGrid(change: { rotationDeg?: number; cellSize?: PaintCellSize }): boolean {
    const base = this.previewBase ?? this.state;
    const rotationDeg = clampRotation(change.rotationDeg ?? this.rotationDeg);
    const cellSize = change.cellSize ?? this.cellSize;
    if (rotationDeg === this.rotationDeg && cellSize === this.cellSize) return false;
    const grid = createHectareGrid(base.grid.frame.origin, { rotationDeg, cellSize });
    const same = rotationDeg === base.grid.frame.rotationDeg && cellSize === base.grid.cellSize;
    this.previewBase = base;
    this.state = same
      ? base
      : {
          grid,
          editor: new GridEditor(
            base.editor.cells.size > 0 ? regridCells(base.grid, base.editor.cells, grid) : [],
          ),
        };
    return true;
  }

  /** cierra el cambio de grilla en curso como un paso del historial */
  commitGrid(): void {
    const base = this.previewBase;
    this.previewBase = null;
    if (!base || base === this.state) return;
    this.state.editor.endStroke();
    base.editor.endStroke();
    this.past.push(base);
    this.future = [];
  }

  /** previewGrid más commitGrid */
  setGrid(change: { rotationDeg?: number; cellSize?: PaintCellSize }): boolean {
    const changed = this.previewGrid(change);
    this.commitGrid();
    return changed;
  }

  /**
   * mueve el origen de la grilla. solo si no hay nada pintado ni historial: sirve para que una
   * celda mida lo que dice cuando el productor se va a pintar lejos del origen
   */
  moveOrigin(origin: Readonly<LatLngTuple>): boolean {
    if (this.cells.size > 0 || this.canUndo || this.canRedo || this.previewBase) return false;
    this.state = {
      grid: createHectareGrid(origin, { rotationDeg: this.rotationDeg, cellSize: this.cellSize }),
      editor: new GridEditor(),
    };
    return true;
  }

  areaHa(): number {
    return cellsAreaHa(this.cells, this.cellSize);
  }

  perimeterM(): number {
    return cellsPerimeterM(this.cells, this.cellSize);
  }

  /** cantidad de sectores separados (regiones unidas por un lado) */
  regionCount(): number {
    return this.cells.size === 0 ? 0 : components(this.cells).length;
  }

  /**
   * polígono para el alta del lote
   * @throws GridShapeError si no hay celdas o si forman más de un sector
   */
  geometry(): PolygonGeometry {
    return cellsToGeometry(this.grid, this.cells);
  }

  snapshot(): PaintSnapshot {
    const cells: number[] = [];
    this.cells.forEach((i, j) => cells.push(i, j));
    return {
      origin: [...this.origin],
      rotationDeg: this.rotationDeg,
      cellSize: this.cellSize,
      cells,
    };
  }

  /** copia de las celdas, para comparar antes y después de un trazo */
  cloneCells(): CellSet {
    return this.cells.clone();
  }

  private edited(changed: boolean): boolean {
    if (changed) this.future = [];
    return changed;
  }
}

/** lleva un giro a [-45, 45] con medio grado de paso, como el control deslizante */
export function clampRotation(deg: number): number {
  const rounded = Math.round(deg * 2) / 2;
  return Math.min(MAX_ROTATION_DEG, Math.max(MIN_ROTATION_DEG, rounded)) + 0;
}

/**
 * giro de grilla que alinea los recuadros con una dirección (grados antihorarios desde el este).
 * una grilla cuadrada se repite cada 90 grados, así que siempre queda entre -45 y 45
 */
export function gridAngleFor(directionDeg: number): number {
  let angle = ((directionDeg % 90) + 90) % 90;
  if (angle > 45) angle -= 90;
  return clampRotation(angle);
}

/** dirección del lado más largo de un anillo en metros locales, o null si no tiene lados */
export function longestSideDeg(ring: readonly (readonly [number, number])[]): number | null {
  let best = 0;
  let angle: number | null = null;
  for (let k = 0; k < ring.length; k++) {
    const [x1, y1] = ring[k];
    const [x2, y2] = ring[(k + 1) % ring.length];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length > best) {
      best = length;
      angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    }
  }
  return angle;
}
