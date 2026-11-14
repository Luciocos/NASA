import { CellSet, ReadonlyCellSet, isValidCell } from './cell-set';
import { Cell } from './hectare-grid';
import { MAX_LINE_CELLS, lineCells } from './raster';

/** qué hace un trazo: pintar celdas o borrarlas */
export type StrokeMode = 'paint' | 'erase';

const MAX_HISTORY = 50;

// una entrada del historial guarda solo lo que cambió, como pares i, j seguidos. guardar una
// copia entera de las celdas por cada trazo no escala cuando hay miles
interface Change {
  added: number[];
  removed: number[];
}

interface Stroke {
  mode: StrokeMode;
  last: Cell | null;
  changed: number[];
}

/**
 * estado de la selección de celdas mientras se pinta: celdas más historial para deshacer
 *
 * es una clase sin angular ni leaflet, como PolygonEditor. no avisa cuando cambia: los métodos
 * que modifican devuelven true si cambió algo, y con eso el componente actualiza una señal
 *
 * @example
 * const editor = new GridEditor();
 * // pointerdown, pointermove y pointerup sobre el mapa
 * editor.beginStroke(erasing ? 'erase' : 'paint');
 * if (editor.strokeTo(cellAt(grid, latlng))) redraw();
 * editor.endStroke();
 * // todo el arrastre se deshace de una sola vez
 * editor.undo();
 */
export class GridEditor {
  private readonly _cells: CellSet;
  private past: Change[] = [];
  private future: Change[] = [];
  private stroke: Stroke | null = null;

  /** @throws RangeError si alguna celda inicial no es válida */
  constructor(initial?: Iterable<Cell>) {
    this._cells = new CellSet(initial);
  }

  /**
   * celdas pintadas. es siempre el mismo objeto y se actualiza solo: para guardar una foto del
   * estado hay que usar `cells.clone()`
   */
  get cells(): ReadonlyCellSet {
    return this._cells;
  }

  /** cantidad de celdas pintadas */
  get size(): number {
    return this._cells.size;
  }

  get canUndo(): boolean {
    return this.past.length > 0 || this.strokeChanged;
  }

  get canRedo(): boolean {
    return this.future.length > 0 && !this.strokeChanged;
  }

  /** modo del trazo en curso, o null si no hay ninguno */
  get strokeMode(): StrokeMode | null {
    return this.stroke?.mode ?? null;
  }

  /** empieza un trazo. si había uno en curso, lo cierra antes */
  beginStroke(mode: StrokeMode): void {
    this.endStroke();
    this.stroke = { mode, last: null, changed: [] };
  }

  /**
   * lleva el trazo hasta una celda y pinta o borra todas las del camino desde la anterior, para
   * que un arrastre rápido no deje huecos. devuelve true si cambió alguna celda
   *
   * no hace nada si no hay un trazo en curso o si la celda no es válida
   */
  strokeTo(cell: Cell): boolean {
    const stroke = this.stroke;
    if (!stroke || !isValidCell(cell[0], cell[1])) return false;
    const before = stroke.changed.length;
    for (const [i, j] of pathTo(stroke.last, cell)) {
      const changed =
        stroke.mode === 'paint' ? this._cells.addAt(i, j) : this._cells.deleteAt(i, j);
      if (changed) stroke.changed.push(i, j);
    }
    stroke.last = [cell[0], cell[1]];
    return stroke.changed.length > before;
  }

  /**
   * cierra el trazo. el trazo entero es una sola entrada del historial, y si no cambió ninguna
   * celda no entra. devuelve true si entró
   */
  endStroke(): boolean {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke || stroke.changed.length === 0) return false;
    this.remember(
      stroke.mode === 'paint'
        ? { added: stroke.changed, removed: [] }
        : { added: [], removed: stroke.changed },
    );
    return true;
  }

  /** pinta la celda si no lo estaba y la borra si lo estaba. es una entrada del historial */
  toggle(cell: Cell): boolean {
    this.endStroke();
    const [i, j] = cell;
    if (!isValidCell(i, j)) return false;
    if (this._cells.deleteAt(i, j)) {
      this.remember({ added: [], removed: [i, j] });
    } else {
      this._cells.addAt(i, j);
      this.remember({ added: [i, j], removed: [] });
    }
    return true;
  }

  /** borra todo. devuelve true si había algo */
  clear(): boolean {
    return this.replaceAll([]);
  }

  /**
   * reemplaza todas las celdas por otras, como una sola entrada del historial. devuelve true si
   * cambió algo
   *
   * @throws RangeError si alguna celda no es válida
   */
  replaceAll(cells: Iterable<Cell>): boolean {
    this.endStroke();
    const next = new CellSet(cells);
    const change: Change = { added: [], removed: [] };
    this._cells.forEach((i, j) => {
      if (!next.hasAt(i, j)) change.removed.push(i, j);
    });
    next.forEach((i, j) => {
      if (!this._cells.hasAt(i, j)) change.added.push(i, j);
    });
    if (change.added.length === 0 && change.removed.length === 0) return false;
    this.apply(change.removed, change.added);
    this.remember(change);
    return true;
  }

  /** deshace la última entrada del historial. un trazo en curso se cierra y se deshace entero */
  undo(): boolean {
    this.endStroke();
    const change = this.past.pop();
    if (!change) return false;
    this.apply(change.added, change.removed);
    this.future.push(change);
    return true;
  }

  /** rehace la última entrada deshecha */
  redo(): boolean {
    this.endStroke();
    const change = this.future.pop();
    if (!change) return false;
    this.apply(change.removed, change.added);
    this.past.push(change);
    return true;
  }

  private get strokeChanged(): boolean {
    return this.stroke !== null && this.stroke.changed.length > 0;
  }

  private remember(change: Change): void {
    this.past.push(change);
    if (this.past.length > MAX_HISTORY) this.past.shift();
    this.future = [];
  }

  private apply(remove: readonly number[], add: readonly number[]): void {
    for (let k = 0; k < remove.length; k += 2) this._cells.deleteAt(remove[k], remove[k + 1]);
    for (let k = 0; k < add.length; k += 2) this._cells.addAt(add[k], add[k + 1]);
  }
}

// celdas a recorrer para llegar a `to`: la línea desde la celda anterior, sin repetirla. un salto
// más largo que una línea válida no se interpola: se toma como un punto suelto
function pathTo(from: Cell | null, to: Cell): Cell[] {
  if (!from) return [to];
  const length = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) + 1;
  return length > MAX_LINE_CELLS ? [to] : lineCells(from, to).slice(1);
}
