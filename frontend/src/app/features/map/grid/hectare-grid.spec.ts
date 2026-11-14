import { LatLngBox, LatLngTuple, ringSignedArea } from '../../../core/geo/local-frame';
import {
  Cell,
  HECTARE_CELL_M,
  QUARTER_HECTARE_CELL_M,
  cellAt,
  cellCenterLatLng,
  cellCenterLocal,
  cellCornersLatLng,
  cellCornersLocal,
  cellKey,
  createHectareGrid,
  parseKey,
  rangeCellCount,
  vertexLatLng,
  visibleCellRange,
} from './hectare-grid';
import { seededRandom } from './testing';

const ORIGIN: LatLngTuple = [-33.05, -61.2];

describe('createHectareGrid', () => {
  it('arma por defecto celdas de una hectárea sin rotación', () => {
    const grid = createHectareGrid(ORIGIN);
    expect(grid.cellSize).toBe(100);
    expect(HECTARE_CELL_M).toBe(100);
    expect(grid.frame.origin).toEqual(ORIGIN);
    expect(grid.frame.rotationDeg).toBe(0);
  });

  it('admite cuartos de hectárea y rotación', () => {
    const grid = createHectareGrid(ORIGIN, { cellSize: QUARTER_HECTARE_CELL_M, rotationDeg: 45 });
    expect(grid.cellSize).toBe(50);
    expect(grid.frame.rotationDeg).toBe(45);
  });

  it('rechaza tamaños de celda que no son un número positivo', () => {
    for (const cellSize of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createHectareGrid(ORIGIN, { cellSize })).toThrow(RangeError);
    }
  });
});

describe('claves de celda', () => {
  it('arma y lee claves, también con negativos', () => {
    const cells: Cell[] = [
      [0, 0],
      [12, 7],
      [-3, 4],
      [5, -9],
      [-120, -4500],
    ];
    for (const cell of cells) {
      expect(parseKey(cellKey(cell))).toEqual(cell);
    }
    expect(cellKey([-3, 4])).toBe('-3,4');
  });

  it('rechaza claves mal formadas', () => {
    for (const key of ['', '1', '1,2,3', 'a,b', '1.5,2', '1, 2', ' 1,2', '1;2', 'NaN,0']) {
      expect(() => parseKey(key)).toThrow(RangeError);
    }
  });

  it('no deja pasar un -0', () => {
    expect(Object.is(parseKey('-0,-0')[0], 0)).toBe(true);
    expect(Object.is(parseKey('-0,-0')[1], 0)).toBe(true);
  });
});

describe('celdas y coordenadas', () => {
  it('ubica la celda de un punto redondeando hacia abajo, también en negativos', () => {
    const grid = createHectareGrid(ORIGIN);
    const at = (x: number, y: number) => cellAt(grid, grid.frame.toLatLng([x, y]));
    expect(at(50, 50)).toEqual([0, 0]);
    expect(at(150, 250)).toEqual([1, 2]);
    expect(at(-1, -1)).toEqual([-1, -1]);
    expect(at(-100.5, 99.5)).toEqual([-2, 0]);
    expect(at(-250, -50)).toEqual([-3, -1]);
  });

  it('con celdas de 50 m entran cuatro en cada hectárea', () => {
    const grid = createHectareGrid(ORIGIN, { cellSize: 50 });
    const at = (x: number, y: number) => cellAt(grid, grid.frame.toLatLng([x, y]));
    expect(at(25, 25)).toEqual([0, 0]);
    expect(at(75, 25)).toEqual([1, 0]);
    expect(at(25, 75)).toEqual([0, 1]);
    expect(at(75, 75)).toEqual([1, 1]);
  });

  it('el origen cae en la celda [0, 0] y nunca devuelve -0', () => {
    const grid = createHectareGrid(ORIGIN, { rotationDeg: 180 });
    const [i, j] = cellAt(grid, ORIGIN);
    expect(Object.is(i, 0)).toBe(true);
    expect(Object.is(j, 0)).toBe(true);
  });

  it('da las 4 esquinas en sentido antihorario y con lados del tamaño de la celda', () => {
    for (const rotationDeg of [0, 37, 45]) {
      const grid = createHectareGrid(ORIGIN, { cellSize: 100, rotationDeg });
      const local = cellCornersLocal(grid, [2, -3]);
      expect(local).toEqual([
        [200, -300],
        [300, -300],
        [300, -200],
        [200, -200],
      ]);
      const corners = cellCornersLatLng(grid, [2, -3]);
      expect(corners.length).toBe(4);
      // medido en un marco sin rotar: antihorario también respecto de este y norte
      const plain = createHectareGrid(ORIGIN).frame;
      const ring = corners.map((corner) => plain.toLocal(corner));
      expect(ringSignedArea(ring)).toBeCloseTo(10_000, 5);
      ring.forEach(([x, y], k) => {
        const [nextX, nextY] = ring[(k + 1) % 4];
        expect(Math.hypot(nextX - x, nextY - y)).toBeCloseTo(100, 6);
      });
    }
  });

  it('con 45 grados las celdas quedan en rombo: la esquina opuesta queda justo al norte', () => {
    const grid = createHectareGrid(ORIGIN, { rotationDeg: 45 });
    const [first, , opposite] = cellCornersLatLng(grid, [0, 0]);
    expect(first[0]).toBeCloseTo(ORIGIN[0], 9);
    expect(first[1]).toBeCloseTo(ORIGIN[1], 9);
    expect(opposite[1]).toBeCloseTo(ORIGIN[1], 9);
    expect(opposite[0]).toBeGreaterThan(ORIGIN[0]);
  });

  it('el centro de una celda cae dentro de esa celda', () => {
    for (const rotationDeg of [0, 37, -80]) {
      for (const cellSize of [50, 100]) {
        const grid = createHectareGrid(ORIGIN, { cellSize, rotationDeg });
        for (const cell of [
          [0, 0],
          [-1, -1],
          [7, -12],
          [-30, 41],
        ] as Cell[]) {
          expect(cellAt(grid, cellCenterLatLng(grid, cell))).toEqual(cell);
          expect(cellCenterLocal(grid, cell)).toEqual([
            (cell[0] + 0.5) * cellSize,
            (cell[1] + 0.5) * cellSize,
          ]);
        }
      }
    }
  });

  it('el vértice [i, j] es la esquina inferior izquierda de la celda [i, j]', () => {
    const grid = createHectareGrid(ORIGIN, { cellSize: 50, rotationDeg: 37 });
    const [corner] = cellCornersLatLng(grid, [4, -2]);
    expect(vertexLatLng(grid, [4, -2])).toEqual(corner);
    expect(vertexLatLng(grid, [0, 0])[0]).toBeCloseTo(ORIGIN[0], 12);
  });
});

describe('visibleCellRange', () => {
  // caja de unos 2 km por 1,5 km corrida respecto del origen
  const BOX: LatLngBox = [
    [-33.062, -61.215],
    [-33.048, -61.193],
  ];

  function samplePoints(count: number): LatLngTuple[] {
    const random = seededRandom(7);
    const [[south, west], [north, east]] = BOX;
    const points: LatLngTuple[] = [
      [south, west],
      [south, east],
      [north, east],
      [north, west],
    ];
    for (let k = 0; k < count; k++) {
      points.push([south + random() * (north - south), west + random() * (east - west)]);
    }
    return points;
  }

  it('sin rotación va de la celda de la esquina suroeste a la de la noreste', () => {
    const grid = createHectareGrid(ORIGIN);
    const [minI, minJ] = cellAt(grid, BOX[0]);
    const [maxI, maxJ] = cellAt(grid, BOX[1]);
    expect(visibleCellRange(grid, BOX)).toEqual({ minI, maxI, minJ, maxJ });
  });

  it('cubre todas las celdas de la caja con cualquier rotación y tamaño', () => {
    const points = samplePoints(400);
    for (const rotationDeg of [0, 20, 37, 45, 90, 135, -60]) {
      for (const cellSize of [50, 100]) {
        const grid = createHectareGrid(ORIGIN, { cellSize, rotationDeg });
        const range = visibleCellRange(grid, BOX);
        for (const point of points) {
          const [i, j] = cellAt(grid, point);
          expect(i).toBeGreaterThanOrEqual(range.minI);
          expect(i).toBeLessThanOrEqual(range.maxI);
          expect(j).toBeGreaterThanOrEqual(range.minJ);
          expect(j).toBeLessThanOrEqual(range.maxJ);
        }
      }
    }
  });

  it('con la grilla rotada toma las 4 esquinas y no solo dos', () => {
    const grid = createHectareGrid(ORIGIN, { rotationDeg: 45 });
    const range = visibleCellRange(grid, BOX);
    const [[south, west], [north, east]] = BOX;
    // a 45 grados los extremos sobre el eje y local son las esquinas noroeste y sureste
    const northWest = cellAt(grid, [north, west]);
    const southEast = cellAt(grid, [south, east]);
    expect(range.maxJ).toBe(northWest[1]);
    expect(range.minJ).toBe(southEast[1]);
    // con solo suroeste y noreste esas celdas habrían quedado afuera
    const southWest = cellAt(grid, [south, west]);
    const northEast = cellAt(grid, [north, east]);
    expect(Math.max(southWest[1], northEast[1])).toBeLessThan(range.maxJ);
    expect(Math.min(southWest[1], northEast[1])).toBeGreaterThan(range.minJ);
  });

  it('no trae mucho más de lo que hace falta', () => {
    const grid = createHectareGrid(ORIGIN);
    const range = visibleCellRange(grid, BOX);
    // la caja mide unos 2055 m por 1553 m: 21 o 22 columnas y 16 o 17 filas de 100 m
    expect(range.maxI - range.minI + 1).toBeLessThanOrEqual(22);
    expect(range.maxJ - range.minJ + 1).toBeLessThanOrEqual(17);
    expect(rangeCellCount(range)).toBeGreaterThanOrEqual(21 * 16);
  });

  it('suma el margen pedido de cada lado', () => {
    const grid = createHectareGrid(ORIGIN, { rotationDeg: 37 });
    const range = visibleCellRange(grid, BOX);
    expect(visibleCellRange(grid, BOX, 2)).toEqual({
      minI: range.minI - 2,
      maxI: range.maxI + 2,
      minJ: range.minJ - 2,
      maxJ: range.maxJ + 2,
    });
  });

  it('cuenta las celdas de un rango', () => {
    expect(rangeCellCount({ minI: 0, maxI: 0, minJ: 0, maxJ: 0 })).toBe(1);
    expect(rangeCellCount({ minI: -2, maxI: 3, minJ: 10, maxJ: 12 })).toBe(18);
    expect(rangeCellCount({ minI: 5, maxI: 2, minJ: 0, maxJ: 3 })).toBe(0);
  });
});
