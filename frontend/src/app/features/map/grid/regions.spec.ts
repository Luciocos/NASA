import { CellSet } from './cell-set';
import { components, isSingleRegion } from './regions';
import { cellsFromArt, sortedKeys } from './testing';

describe('components', () => {
  it('un conjunto vacío no tiene regiones', () => {
    expect(components(new CellSet())).toEqual([]);
    expect(isSingleRegion(new CellSet())).toBe(false);
  });

  it('una celda sola es una región', () => {
    const cells = new CellSet([[4, -2]]);
    const regions = components(cells);
    expect(regions.length).toBe(1);
    expect([...regions[0]]).toEqual([[4, -2]]);
    expect(isSingleRegion(cells)).toBe(true);
  });

  it('dos celdas que comparten un lado son una región', () => {
    expect(components(cellsFromArt(['##'])).length).toBe(1);
    expect(components(cellsFromArt(['#', '#'])).length).toBe(1);
  });

  it('dos celdas que se tocan solo en diagonal son dos regiones', () => {
    for (const art of [
      ['.#', '#.'],
      ['#.', '.#'],
    ]) {
      const cells = cellsFromArt(art);
      expect(components(cells).length).toBe(2);
      expect(isSingleRegion(cells)).toBe(false);
    }
  });

  it('separa los bloques y los ordena del más grande al más chico', () => {
    const cells = cellsFromArt([
      '##...#', //
      '.....#',
      '###..#',
      '#.#...',
      '###.#.',
    ]);
    const regions = components(cells);
    expect(regions.map((region) => region.size)).toEqual([8, 3, 2, 1]);
    expect(sortedKeys(regions[0])).toEqual(
      sortedKeys([
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [2, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ]),
    );
    expect(sortedKeys(regions[3])).toEqual(['4,0']);
    expect(isSingleRegion(cells)).toBe(false);
  });

  it('las regiones no comparten celdas y entre todas suman el total', () => {
    const cells = cellsFromArt([
      '#.#.#.#', //
      '.#.#.#.',
      '#######',
      '.#...#.',
    ]);
    const regions = components(cells);
    const all = new CellSet();
    let total = 0;
    for (const region of regions) {
      total += region.size;
      region.forEach((i, j) => {
        expect(cells.hasAt(i, j)).toBe(true);
        expect(all.addAt(i, j)).toBe(true);
      });
    }
    expect(total).toBe(cells.size);
    expect(all.equals(cells)).toBe(true);
    // la fila entera junta a las celdas de la fila de arriba y a las dos de abajo
    expect(regions[0].size).toBe(7 + 3 + 2);
    expect(regions.length).toBe(1 + 4);
  });

  it('a igual tamaño queda primero la región que se pintó antes', () => {
    const cells = new CellSet([
      [10, 10],
      [0, 0],
      [5, 5],
    ]);
    expect(components(cells).map((region) => [...region][0])).toEqual([
      [10, 10],
      [0, 0],
      [5, 5],
    ]);
  });

  it('devuelve copias: tocarlas no cambia el conjunto original', () => {
    const cells = cellsFromArt(['##']);
    const [region] = components(cells);
    region.add([9, 9]);
    expect(cells.size).toBe(2);
  });
});

describe('isSingleRegion', () => {
  it('un anillo con un hueco es una sola región', () => {
    expect(isSingleRegion(cellsFromArt(['###', '#.#', '###']))).toBe(true);
  });

  it('una celda suelta alcanza para que deje de ser una sola', () => {
    expect(isSingleRegion(cellsFromArt(['###..', '###.#', '###..']))).toBe(false);
  });

  it('una celda dentro de un hueco, tocando solo en diagonal, es otra región', () => {
    expect(isSingleRegion(cellsFromArt(['#####', '#...#', '#.#.#', '#...#', '#####']))).toBe(false);
    expect(isSingleRegion(cellsFromArt(['####', '#..#', '#.##', '####']))).toBe(true);
  });

  it('recorre una tira de 20.000 celdas sin desbordar la pila', () => {
    const cells = new CellSet();
    for (let i = 0; i < 20_000; i++) cells.addAt(i, 0);
    expect(isSingleRegion(cells)).toBe(true);
    expect(components(cells).length).toBe(1);
    cells.deleteAt(10_000, 0);
    expect(isSingleRegion(cells)).toBe(false);
    expect(components(cells).map((region) => region.size)).toEqual([10_000, 9_999]);
  });

  it('une una espiral larga por lados', () => {
    const spiral = cellsFromArt([
      '#########',
      '........#',
      '#######.#',
      '#.....#.#',
      '#.###.#.#',
      '#.#...#.#',
      '#.#####.#',
      '#.......#',
      '#########',
    ]);
    expect(isSingleRegion(spiral)).toBe(true);
    expect(components(spiral)[0].size).toBe(spiral.size);
  });
});
