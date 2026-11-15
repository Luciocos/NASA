import { Cell, CellRange } from './hectare-grid';

/**
 * mayor valor absoluto que admite una coordenada de celda. son más de 16 millones de celdas por
 * lado: sobra para cualquier campo y deja lugar para empaquetar la celda en un solo número
 */
export const MAX_CELL_COORD = 2 ** 24;

// cada celda se guarda como un entero: (i + OFFSET) * SPAN + (j + OFFSET). con este rango la
// clave no pasa de 2^52, así que es exacta, y un Set de números es bastante más rápido y liviano
// que uno de textos "i,j"
const OFFSET = 2 ** 25;
const SPAN = 2 ** 26;

/** parte de solo lectura de un CellSet: lo que reciben las funciones que no lo modifican */
export interface ReadonlyCellSet extends Iterable<Cell> {
  /** cantidad de celdas */
  readonly size: number;
  has(cell: Cell): boolean;
  /** igual que has, pero sin armar la tupla: para recorridos de muchos vecinos */
  hasAt(i: number, j: number): boolean;
  /** celdas en el orden en que se agregaron */
  values(): IterableIterator<Cell>;
  /** recorre las celdas sin crear una tupla por cada una */
  forEach(callback: (i: number, j: number) => void): void;
  /** caja que contiene a todas las celdas, o null si no hay ninguna */
  bounds(): CellRange | null;
  /** true si los dos conjuntos tienen exactamente las mismas celdas */
  equals(other: ReadonlyCellSet): boolean;
  /** copia independiente y modificable */
  clone(): CellSet;
}

/**
 * conjunto de celdas de la grilla, pensado para miles de celdas: buscar, agregar y quitar
 * cuestan tiempo constante y no crean objetos
 *
 * @example
 * const cells = new CellSet([[0, 0], [1, 0]]);
 * cells.add([1, 1]); // true: no estaba
 * cells.has([1, 1]); // true
 * for (const [i, j] of cells) draw(i, j);
 */
export class CellSet implements ReadonlyCellSet {
  private readonly keys = new Set<number>();
  // caja de las celdas: se extiende al agregar y se recalcula solo si se quita una celda del borde
  private box: CellRange = { minI: 0, maxI: 0, minJ: 0, maxJ: 0 };
  private boxStale = false;

  /** @throws RangeError si alguna celda no es válida (ver add) */
  constructor(cells?: Iterable<Cell>) {
    if (cells instanceof CellSet) {
      this.copyFrom(cells);
    } else if (cells) {
      for (const cell of cells) this.addAt(cell[0], cell[1]);
    }
  }

  get size(): number {
    return this.keys.size;
  }

  has(cell: Cell): boolean {
    return this.hasAt(cell[0], cell[1]);
  }

  hasAt(i: number, j: number): boolean {
    return isValidCell(i, j) && this.keys.has(pack(i, j));
  }

  /**
   * agrega una celda. devuelve true si no estaba
   *
   * @throws RangeError si i o j no son enteros o pasan de MAX_CELL_COORD
   */
  add(cell: Cell): boolean {
    return this.addAt(cell[0], cell[1]);
  }

  /** igual que add, pero sin armar la tupla */
  addAt(i: number, j: number): boolean {
    if (!isValidCell(i, j)) throw new RangeError(`celda inválida: [${i}, ${j}]`);
    const key = pack(i, j);
    if (this.keys.has(key)) return false;
    // un -0 es la misma celda que un 0, pero no tiene que colarse en la caja
    i += 0;
    j += 0;
    if (this.keys.size === 0) {
      this.box = { minI: i, maxI: i, minJ: j, maxJ: j };
      this.boxStale = false;
    } else if (!this.boxStale) {
      const box = this.box;
      if (i < box.minI) box.minI = i;
      if (i > box.maxI) box.maxI = i;
      if (j < box.minJ) box.minJ = j;
      if (j > box.maxJ) box.maxJ = j;
    }
    this.keys.add(key);
    return true;
  }

  /** quita una celda. devuelve true si estaba */
  delete(cell: Cell): boolean {
    return this.deleteAt(cell[0], cell[1]);
  }

  /** igual que delete, pero sin armar la tupla */
  deleteAt(i: number, j: number): boolean {
    if (!isValidCell(i, j) || !this.keys.delete(pack(i, j))) return false;
    const box = this.box;
    if (i === box.minI || i === box.maxI || j === box.minJ || j === box.maxJ) this.boxStale = true;
    return true;
  }

  /** quita todas las celdas */
  clear(): void {
    this.keys.clear();
    this.boxStale = false;
  }

  *values(): IterableIterator<Cell> {
    for (const key of this.keys) yield unpack(key);
  }

  [Symbol.iterator](): IterableIterator<Cell> {
    return this.values();
  }

  forEach(callback: (i: number, j: number) => void): void {
    for (const key of this.keys) callback(Math.floor(key / SPAN) - OFFSET, (key % SPAN) - OFFSET);
  }

  bounds(): CellRange | null {
    if (this.keys.size === 0) return null;
    if (this.boxStale) {
      const box: CellRange = { minI: Infinity, maxI: -Infinity, minJ: Infinity, maxJ: -Infinity };
      this.forEach((i, j) => {
        if (i < box.minI) box.minI = i;
        if (i > box.maxI) box.maxI = i;
        if (j < box.minJ) box.minJ = j;
        if (j > box.maxJ) box.maxJ = j;
      });
      this.box = box;
      this.boxStale = false;
    }
    return { ...this.box };
  }

  equals(other: ReadonlyCellSet): boolean {
    if (other === this) return true;
    if (other.size !== this.keys.size) return false;
    for (const key of this.keys) {
      if (!other.hasAt(Math.floor(key / SPAN) - OFFSET, (key % SPAN) - OFFSET)) return false;
    }
    return true;
  }

  clone(): CellSet {
    return new CellSet(this);
  }

  private copyFrom(other: CellSet): void {
    for (const key of other.keys) this.keys.add(key);
    this.box = { ...other.box };
    this.boxStale = other.boxStale;
  }
}

/**
 * true si [i, j] puede ser una celda: dos enteros que no pasan de MAX_CELL_COORD
 *
 * un valor que no es entero no puede llegar a empaquetarse: caería sobre la clave de otra celda
 */
export function isValidCell(i: number, j: number): boolean {
  return (
    Number.isInteger(i) &&
    Number.isInteger(j) &&
    i >= -MAX_CELL_COORD &&
    i <= MAX_CELL_COORD &&
    j >= -MAX_CELL_COORD &&
    j <= MAX_CELL_COORD
  );
}

function pack(i: number, j: number): number {
  return (i + OFFSET) * SPAN + (j + OFFSET);
}

function unpack(key: number): Cell {
  return [Math.floor(key / SPAN) - OFFSET, (key % SPAN) - OFFSET];
}
