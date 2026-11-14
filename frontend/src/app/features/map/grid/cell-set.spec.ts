import { CellSet, MAX_CELL_COORD, ReadonlyCellSet, isValidCell } from './cell-set';
import { Cell } from './hectare-grid';

describe('CellSet', () => {
  it('agrega, busca y quita celdas, y avisa si cambió algo', () => {
    const cells = new CellSet();
    expect(cells.size).toBe(0);
    expect(cells.add([2, 3])).toBe(true);
    expect(cells.add([2, 3])).toBe(false);
    expect(cells.size).toBe(1);
    expect(cells.has([2, 3])).toBe(true);
    expect(cells.has([3, 2])).toBe(false);
    expect(cells.delete([3, 2])).toBe(false);
    expect(cells.delete([2, 3])).toBe(true);
    expect(cells.delete([2, 3])).toBe(false);
    expect(cells.size).toBe(0);
  });

  it('distingue celdas con coordenadas negativas y las devuelve tal cual', () => {
    const input: Cell[] = [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [-5000, 4321],
      [4321, -5000],
    ];
    const cells = new CellSet(input);
    expect(cells.size).toBe(input.length);
    expect([...cells]).toEqual(input);
    for (const cell of input) expect(cells.has(cell)).toBe(true);
    expect(cells.has([1, 1])).toBe(false);
    expect(cells.has([-5000, -4321])).toBe(false);
  });

  it('ofrece las variantes sin tupla', () => {
    const cells = new CellSet();
    expect(cells.addAt(4, -2)).toBe(true);
    expect(cells.hasAt(4, -2)).toBe(true);
    expect(cells.hasAt(-2, 4)).toBe(false);
    expect(cells.deleteAt(4, -2)).toBe(true);
    expect(cells.hasAt(4, -2)).toBe(false);
  });

  it('recorre las celdas en el orden en que se agregaron', () => {
    const cells = new CellSet([
      [3, 3],
      [1, 1],
      [2, 2],
    ]);
    cells.delete([1, 1]);
    cells.add([1, 1]);
    const expected = [
      [3, 3],
      [2, 2],
      [1, 1],
    ];
    expect([...cells.values()]).toEqual(expected);
    expect([...cells]).toEqual(expected);
    const visited: number[][] = [];
    cells.forEach((i, j) => visited.push([i, j]));
    expect(visited).toEqual(expected);
  });

  it('admite hasta MAX_CELL_COORD y rechaza lo que pasa o no es entero', () => {
    const cells = new CellSet();
    expect(cells.add([MAX_CELL_COORD, -MAX_CELL_COORD])).toBe(true);
    expect(cells.has([MAX_CELL_COORD, -MAX_CELL_COORD])).toBe(true);
    expect([...cells]).toEqual([[MAX_CELL_COORD, -MAX_CELL_COORD]]);
    for (const cell of [
      [MAX_CELL_COORD + 1, 0],
      [0, -MAX_CELL_COORD - 1],
      [0.5, 0],
      [0, Number.NaN],
      [Number.POSITIVE_INFINITY, 0],
    ] as Cell[]) {
      expect(() => cells.add(cell)).toThrow(RangeError);
      expect(cells.has(cell)).toBe(false);
      expect(cells.delete(cell)).toBe(false);
      expect(isValidCell(cell[0], cell[1])).toBe(false);
    }
    expect(() => new CellSet([[0, 0.25]])).toThrow(RangeError);
    expect(isValidCell(-3, 7)).toBe(true);
    expect(cells.size).toBe(1);
  });

  it('buscar un vecino fuera de rango o con decimales no confunde con otra celda', () => {
    const cells = new CellSet([
      [0, 5],
      [1, -MAX_CELL_COORD],
      [MAX_CELL_COORD, MAX_CELL_COORD],
    ]);
    // con el empaquetado sin validar estas tres búsquedas caían sobre claves que sí existen
    expect(cells.hasAt(5 / 2 ** 26, 0)).toBe(false);
    expect(cells.hasAt(0, 2 ** 25 + 2 ** 24)).toBe(false);
    expect(cells.hasAt(MAX_CELL_COORD, MAX_CELL_COORD + 1)).toBe(false);
    expect(cells.hasAt(MAX_CELL_COORD + 1, MAX_CELL_COORD)).toBe(false);
  });

  it('la copia es independiente del original', () => {
    const original = new CellSet([
      [0, 0],
      [1, 0],
    ]);
    const copy = original.clone();
    expect(copy).not.toBe(original);
    expect(copy.equals(original)).toBe(true);
    copy.add([5, 5]);
    original.delete([0, 0]);
    expect(copy.size).toBe(3);
    expect(copy.has([0, 0])).toBe(true);
    expect(original.size).toBe(1);
    expect(original.has([5, 5])).toBe(false);
    expect(copy.bounds()).toEqual({ minI: 0, maxI: 5, minJ: 0, maxJ: 5 });
    expect(original.bounds()).toEqual({ minI: 1, maxI: 1, minJ: 0, maxJ: 0 });
  });

  it('se puede armar a partir de otro conjunto o de cualquier iterable', () => {
    const base = new CellSet([
      [7, 8],
      [-7, -8],
    ]);
    const fromSet = new CellSet(base);
    const fromGenerator = new CellSet(base.values());
    expect(fromSet.equals(base)).toBe(true);
    expect(fromGenerator.equals(base)).toBe(true);
    expect(fromSet.bounds()).toEqual({ minI: -7, maxI: 7, minJ: -8, maxJ: 8 });
  });

  it('compara por contenido, sin importar el orden', () => {
    const a = new CellSet([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    const b = new CellSet([
      [1, 1],
      [0, 0],
      [1, 0],
    ]);
    const readonlyView: ReadonlyCellSet = b;
    expect(a.equals(a)).toBe(true);
    expect(a.equals(readonlyView)).toBe(true);
    expect(b.equals(a)).toBe(true);
    b.delete([1, 1]);
    expect(a.equals(b)).toBe(false);
    b.add([2, 2]);
    expect(a.equals(b)).toBe(false);
    expect(new CellSet().equals(new CellSet())).toBe(true);
  });

  it('vacía el conjunto', () => {
    const cells = new CellSet([
      [4, 4],
      [9, 9],
    ]);
    cells.clear();
    expect(cells.size).toBe(0);
    expect(cells.bounds()).toBeNull();
    cells.add([-2, 6]);
    expect(cells.bounds()).toEqual({ minI: -2, maxI: -2, minJ: 6, maxJ: 6 });
  });
});

describe('CellSet.bounds', () => {
  it('no hay caja sin celdas', () => {
    expect(new CellSet().bounds()).toBeNull();
  });

  it('crece al agregar celdas', () => {
    const cells = new CellSet([[2, 2]]);
    expect(cells.bounds()).toEqual({ minI: 2, maxI: 2, minJ: 2, maxJ: 2 });
    cells.add([-4, 3]);
    cells.add([6, -1]);
    expect(cells.bounds()).toEqual({ minI: -4, maxI: 6, minJ: -1, maxJ: 3 });
  });

  it('se achica al quitar una celda del borde y no cambia al quitar una de adentro', () => {
    const cells = new CellSet([
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
      [2, 2],
      [9, 2],
    ]);
    cells.delete([2, 2]);
    expect(cells.bounds()).toEqual({ minI: 0, maxI: 9, minJ: 0, maxJ: 5 });
    cells.delete([9, 2]);
    expect(cells.bounds()).toEqual({ minI: 0, maxI: 5, minJ: 0, maxJ: 5 });
    // agregar después de quitar una del borde tampoco deja la caja vieja
    cells.delete([0, 5]);
    cells.delete([5, 5]);
    cells.add([1, 1]);
    expect(cells.bounds()).toEqual({ minI: 0, maxI: 5, minJ: 0, maxJ: 1 });
  });

  it('vuelve a empezar cuando el conjunto queda vacío', () => {
    const cells = new CellSet([[50, 50]]);
    cells.delete([50, 50]);
    expect(cells.bounds()).toBeNull();
    cells.add([-3, -3]);
    expect(cells.bounds()).toEqual({ minI: -3, maxI: -3, minJ: -3, maxJ: -3 });
  });

  it('devuelve una copia: modificarla no altera el conjunto', () => {
    const cells = new CellSet([[1, 1]]);
    const box = cells.bounds()!;
    box.minI = -100;
    expect(cells.bounds()).toEqual({ minI: 1, maxI: 1, minJ: 1, maxJ: 1 });
  });
});

describe('CellSet con miles de celdas', () => {
  it('maneja 40.000 celdas con todas las operaciones', () => {
    const side = 200;
    const cells = new CellSet();
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) cells.addAt(i - 100, j - 100);
    }
    expect(cells.size).toBe(side * side);
    expect(cells.bounds()).toEqual({ minI: -100, maxI: 99, minJ: -100, maxJ: 99 });
    let found = 0;
    for (let j = -101; j <= 100; j++) {
      for (let i = -101; i <= 100; i++) if (cells.hasAt(i, j)) found++;
    }
    expect(found).toBe(side * side);
    const copy = cells.clone();
    expect(copy.equals(cells)).toBe(true);
    // saca una de cada dos filas
    for (let j = -100; j < 100; j += 2) {
      for (let i = -100; i < 100; i++) cells.deleteAt(i, j);
    }
    expect(cells.size).toBe((side * side) / 2);
    expect(cells.bounds()).toEqual({ minI: -100, maxI: 99, minJ: -99, maxJ: 99 });
    expect(copy.equals(cells)).toBe(false);
    expect(copy.size).toBe(side * side);
  });
});
