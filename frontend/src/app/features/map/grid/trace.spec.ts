import { CellSet } from './cell-set';
import { Cell, GridVertex } from './hectare-grid';
import {
  cellsFromArt,
  pinchVertices,
  ringProblems,
  ringSteps,
  seededRandom,
  sortedKeys,
} from './testing';
import { GridShapeError, traceRings } from './trace';

/** traza una forma dibujada y revisa de paso todo lo que tienen que cumplir sus contornos */
function trace(art: string | readonly string[]) {
  const cells = cellsFromArt(art);
  const rings = traceRings(cells);
  expect(ringProblems(cells, rings)).toEqual([]);
  return rings;
}

function visitsOf(ring: readonly GridVertex[], vertex: GridVertex): number {
  return ringSteps(ring).filter(([x, y]) => x === vertex[0] && y === vertex[1]).length;
}

describe('traceRings: formas sin huecos', () => {
  it('una sola celda da su cuadrado en sentido antihorario', () => {
    expect(trace(['#'])).toEqual({
      exterior: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      holes: [],
    });
  });

  it('una celda lejos del origen y en negativos', () => {
    const rings = traceRings(new CellSet([[-7, 12]]));
    expect(rings.exterior).toEqual([
      [-7, 12],
      [-6, 12],
      [-6, 13],
      [-7, 13],
    ]);
  });

  it('una tira de una celda de ancho no deja vértices intermedios', () => {
    expect(trace(['#####']).exterior).toEqual([
      [0, 0],
      [5, 0],
      [5, 1],
      [0, 1],
    ]);
    expect(trace(['#', '#', '#', '#']).exterior).toEqual([
      [0, 0],
      [1, 0],
      [1, 4],
      [0, 4],
    ]);
  });

  it('un bloque lleno da solo sus 4 esquinas', () => {
    expect(trace(['####', '####', '####']).exterior).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]);
  });

  it('forma en L', () => {
    const rings = trace(`
      #.
      #.
      ##
    `);
    expect(rings.holes).toEqual([]);
    expect(rings.exterior).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ]);
  });

  it('forma en T: arranca en el vértice más bajo, que no es el [0, 0]', () => {
    const rings = trace(`
      ###
      .#.
      .#.
    `);
    expect(rings.holes).toEqual([]);
    expect(rings.exterior).toEqual([
      [1, 0],
      [2, 0],
      [2, 2],
      [3, 2],
      [3, 3],
      [0, 3],
      [0, 2],
      [1, 2],
    ]);
  });

  it('forma en U: la entrada no es un hueco', () => {
    const rings = trace(`
      #.#
      #.#
      ###
    `);
    expect(rings.holes).toEqual([]);
    expect(rings.exterior).toEqual([
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ]);
  });

  it('forma en cruz', () => {
    const rings = trace(`
      .#.
      ###
      .#.
    `);
    expect(rings.exterior.length).toBe(12);
    expect(rings.exterior[0]).toEqual([1, 0]);
    expect(rings.holes).toEqual([]);
  });

  it('una escalera en diagonal unida por lados es un solo anillo', () => {
    const rings = trace(`
      ..##
      .##.
      ##..
    `);
    expect(rings.holes).toEqual([]);
    expect(rings.exterior).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
      [3, 1],
      [3, 2],
      [4, 2],
      [4, 3],
      [2, 3],
      [2, 2],
      [1, 2],
      [1, 1],
      [0, 1],
    ]);
  });

  it('una tira en zigzag de una celda de ancho', () => {
    const rings = trace(`
      ###.###
      #.#.#.#
      #.###.#
    `);
    expect(rings.holes).toEqual([]);
    // una tira recta tiene 4 vértices y cada codo suma 2: acá hay 6 codos
    expect(rings.exterior.length).toBe(16);
  });
});

describe('traceRings: huecos', () => {
  it('una dona: exterior antihorario y hueco horario', () => {
    expect(
      trace(`
        ###
        #.#
        ###
      `),
    ).toEqual({
      exterior: [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ],
      holes: [
        [
          [1, 1],
          [1, 2],
          [2, 2],
          [2, 1],
        ],
      ],
    });
  });

  it('dos huecos, ordenados por su vértice más bajo', () => {
    const rings = trace(`
      #####
      #.#.#
      #####
    `);
    expect(rings.exterior).toEqual([
      [0, 0],
      [5, 0],
      [5, 3],
      [0, 3],
    ]);
    expect(rings.holes).toEqual([
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
      ],
      [
        [3, 1],
        [3, 2],
        [4, 2],
        [4, 1],
      ],
    ]);
  });

  it('un hueco de varias celdas con forma de L', () => {
    const rings = trace(`
      #####
      #.###
      #...#
      #####
    `);
    expect(rings.holes).toEqual([
      [
        [1, 1],
        [1, 3],
        [2, 3],
        [2, 2],
        [4, 2],
        [4, 1],
      ],
    ]);
  });

  it('un hueco con una península adentro y otro hueco dentro de la península', () => {
    const rings = trace(`
      #######
      #.....#
      #.###.#
      #.#.#.#
      #.###.#
      #..#..#
      #######
    `);
    expect(rings.exterior).toEqual([
      [0, 0],
      [7, 0],
      [7, 7],
      [0, 7],
    ]);
    expect(rings.holes).toEqual([
      [
        [1, 1],
        [1, 6],
        [6, 6],
        [6, 1],
        [4, 1],
        [4, 2],
        [5, 2],
        [5, 5],
        [2, 5],
        [2, 2],
        [3, 2],
        [3, 1],
      ],
      [
        [3, 3],
        [3, 4],
        [4, 4],
        [4, 3],
      ],
    ]);
  });
});

describe('traceRings: pellizcos', () => {
  it('hueco que toca el exterior en una esquina, diagonal ascendente', () => {
    // en el vértice [2, 1] se tocan en diagonal las celdas pintadas [1, 0] y [2, 1]. las otras
    // dos son el hueco [1, 1] y la celda de afuera [2, 0]
    const art = `
      ###
      #.#
      ##.
    `;
    const rings = trace(art);
    expect(pinchVertices(cellsFromArt(art))).toEqual([[2, 1]]);
    expect(rings.exterior).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
      [3, 1],
      [3, 3],
      [0, 3],
    ]);
    expect(rings.holes).toEqual([
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
      ],
    ]);
    // cada anillo pasa una sola vez por el pellizco: se tocan ahí, pero ninguno se repite
    expect(visitsOf(rings.exterior, [2, 1])).toBe(1);
    expect(visitsOf(rings.holes[0], [2, 1])).toBe(1);
  });

  it('hueco que toca el exterior en una esquina, diagonal descendente', () => {
    // en el vértice [1, 1] se tocan en diagonal las celdas pintadas [0, 1] y [1, 0]
    const art = `
      ###
      #.#
      .##
    `;
    const rings = trace(art);
    expect(pinchVertices(cellsFromArt(art))).toEqual([[1, 1]]);
    expect(rings.exterior).toEqual([
      [1, 0],
      [3, 0],
      [3, 3],
      [0, 3],
      [0, 1],
      [1, 1],
    ]);
    expect(rings.holes).toEqual([
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
      ],
    ]);
    expect(visitsOf(rings.exterior, [1, 1])).toBe(1);
    expect(visitsOf(rings.holes[0], [1, 1])).toBe(1);
  });

  it('dos huecos que se tocan en diagonal son dos anillos, no uno que se toca a sí mismo', () => {
    const descending = trace(`
      ####
      #.##
      ##.#
      ####
    `);
    expect(descending.holes).toEqual([
      [
        [2, 1],
        [2, 2],
        [3, 2],
        [3, 1],
      ],
      [
        [1, 2],
        [1, 3],
        [2, 3],
        [2, 2],
      ],
    ]);
    const ascending = trace(`
      ####
      ##.#
      #.##
      ####
    `);
    expect(ascending.holes).toEqual([
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
      ],
      [
        [2, 2],
        [2, 3],
        [3, 3],
        [3, 2],
      ],
    ]);
    for (const rings of [descending, ascending]) {
      expect(rings.exterior.length).toBe(4);
      for (const hole of rings.holes) expect(visitsOf(hole, [2, 2])).toBe(1);
    }
  });

  it('varios pellizcos en la misma región, en las dos diagonales', () => {
    // cuatro pellizcos entre huecos vecinos y uno, el [4, 4], entre un hueco y el exterior
    const art = `
      ####.#
      #.#.##
      ##.#.#
      #.####
      ####..
    `;
    const cells = cellsFromArt(art);
    const rings = trace(art);
    const pinches = pinchVertices(cells);
    expect(sortedKeys(pinches)).toEqual(['2,2', '2,3', '3,3', '4,3', '4,4']);
    expect(rings.holes.length).toBe(5);
    expect(visitsOf(rings.exterior, [4, 4])).toBe(1);
    for (const pinch of pinches) {
      const through = [rings.exterior, ...rings.holes].filter(
        (ring) => visitsOf(ring, pinch) === 1,
      );
      expect(through.length).toBe(2);
    }
    for (const ring of [rings.exterior, ...rings.holes]) {
      const steps = ringSteps(ring).map(([x, y]) => `${x},${y}`);
      expect(new Set(steps).size).toBe(steps.length);
    }
  });

  it('una cadena de huecos en diagonal queda como huecos separados', () => {
    const rings = trace(`
      ######
      #.####
      ##.###
      ###.##
      ####.#
      ######
    `);
    expect(rings.holes.length).toBe(4);
    for (const hole of rings.holes) expect(hole.length).toBe(4);
  });
});

describe('traceRings: errores y forma canónica', () => {
  it('sin celdas avisa que no hay nada marcado', () => {
    expect(() => traceRings(new CellSet())).toThrow(GridShapeError);
    try {
      traceRings(new CellSet());
    } catch (error) {
      expect((error as GridShapeError).problem).toBe('empty');
      expect((error as GridShapeError).name).toBe('GridShapeError');
      expect((error as GridShapeError).message).toBe('No hay recuadros marcados.');
    }
  });

  it('con dos bloques separados avisa que hay más de una región', () => {
    const cells = cellsFromArt(['##.##']);
    expect(() => traceRings(cells)).toThrow(GridShapeError);
    try {
      traceRings(cells);
    } catch (error) {
      expect((error as GridShapeError).problem).toBe('multiple-regions');
      expect((error as GridShapeError).message).toContain('más de un bloque');
    }
  });

  it('dos bloques que se tocan solo en diagonal también son más de una región', () => {
    for (const art of [
      ['.#', '#.'],
      ['#.', '.#'],
      ['##.', '##.', '..#'],
    ]) {
      expect(() => traceRings(cellsFromArt(art))).toThrow(GridShapeError);
    }
  });

  it('el resultado no depende del orden en que se pintaron las celdas', () => {
    const art = `
      ######
      #.#..#
      ##.###
      #.##.#
      ######
    `;
    const cells = [...cellsFromArt(art)];
    const expected = traceRings(new CellSet(cells));
    const random = seededRandom(3);
    for (let n = 0; n < 20; n++) {
      const shuffled: Cell[] = [...cells];
      for (let k = shuffled.length - 1; k > 0; k--) {
        const swap = Math.floor(random() * (k + 1));
        [shuffled[k], shuffled[swap]] = [shuffled[swap], shuffled[k]];
      }
      expect(traceRings(new CellSet(shuffled))).toEqual(expected);
    }
  });

  it('traza un bloque de 10.000 celdas y una tira de 5.000 sin vértices de más', () => {
    const block = new CellSet();
    for (let j = 0; j < 100; j++) {
      for (let i = 0; i < 100; i++) block.addAt(i - 50, j - 50);
    }
    expect(traceRings(block)).toEqual({
      exterior: [
        [-50, -50],
        [50, -50],
        [50, 50],
        [-50, 50],
      ],
      holes: [],
    });
    const strip = new CellSet();
    for (let i = 0; i < 5000; i++) strip.addAt(i, 0);
    expect(traceRings(strip).exterior).toEqual([
      [0, 0],
      [5000, 0],
      [5000, 1],
      [0, 1],
    ]);
  });

  it('un tablero con un hueco cada dos celdas da todos los huecos', () => {
    const cells = new CellSet();
    for (let j = 0; j < 41; j++) {
      for (let i = 0; i < 41; i++) {
        if (i % 2 === 0 || j % 2 === 0) cells.addAt(i, j);
      }
    }
    const rings = traceRings(cells);
    expect(rings.holes.length).toBe(20 * 20);
    expect(ringProblems(cells, rings)).toEqual([]);
  });
});
