import { LatLngTuple, XY } from '../../../core/geo/local-frame';
import { PolygonGeometry } from '../../../core/models';
import { toPolygonGeometry } from '../geo';
import { MAX_CELL_COORD } from './cell-set';
import { Cell, HectareGrid, cellCornersLatLng, createHectareGrid } from './hectare-grid';
import { MAX_LINE_CELLS, lineCells, rasterizePolygon, rasterizeRings } from './raster';
import { cellsFromArt, seededRandom, sortedKeys } from './testing';

const ORIGIN: LatLngTuple = [-33.05, -61.2];

/** polígono a partir de puntos en metros locales de la grilla, con huecos opcionales */
function localPolygon(grid: HectareGrid, exterior: XY[], ...holes: XY[][]): PolygonGeometry {
  const toRing = (ring: XY[]) => {
    const positions = ring.map((point) => {
      const [lat, lng] = grid.frame.toLatLng(point);
      return [lng, lat];
    });
    return [...positions, positions[0]];
  };
  return { type: 'Polygon', coordinates: [exterior, ...holes].map(toRing) };
}

describe('lineCells', () => {
  it('de una celda a sí misma es esa sola celda', () => {
    expect(lineCells([3, -2], [3, -2])).toEqual([[3, -2]]);
  });

  it('une dos celdas en fila o en columna, en los dos sentidos', () => {
    expect(lineCells([0, 0], [3, 0])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(lineCells([1, 2], [1, -1])).toEqual([
      [1, 2],
      [1, 1],
      [1, 0],
      [1, -1],
    ]);
    expect(lineCells([-1, 5], [-4, 5])).toEqual([
      [-1, 5],
      [-2, 5],
      [-3, 5],
      [-4, 5],
    ]);
  });

  it('en diagonal arma una escalera, sin saltar de esquina a esquina', () => {
    expect(lineCells([0, 0], [2, 2])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ]);
    expect(lineCells([0, 0], [-2, 2])).toEqual([
      [0, 0],
      [-1, 0],
      [-1, 1],
      [-2, 1],
      [-2, 2],
    ]);
  });

  it('reparte los escalones a lo largo de una línea inclinada', () => {
    // la recta entre los centros cruza de fila justo en las esquinas (2, 1) y (5, 2): en ese
    // empate avanza primero por i
    expect(lineCells([0, 0], [6, 2])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
      [5, 2],
      [6, 2],
    ]);
    expect(lineCells([0, 0], [1, 4])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 3],
      [1, 4],
    ]);
  });

  it('cada paso comparte un lado con el anterior, en cualquier dirección', () => {
    const random = seededRandom(11);
    const coordinate = () => Math.floor(random() * 61) - 30;
    for (let n = 0; n < 500; n++) {
      const a: Cell = [coordinate(), coordinate()];
      const b: Cell = [coordinate(), coordinate()];
      const line = lineCells(a, b);
      expect(line[0]).toEqual(a);
      expect(line[line.length - 1]).toEqual(b);
      expect(line.length).toBe(Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + 1);
      expect(new Set(sortedKeys(line)).size).toBe(line.length);
      for (let k = 1; k < line.length; k++) {
        const step = Math.abs(line[k][0] - line[k - 1][0]) + Math.abs(line[k][1] - line[k - 1][1]);
        expect(step).toBe(1);
      }
      // ninguna celda se aleja de la recta entre los centros más que media diagonal de celda
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (const [i, j] of line) {
        const cross = (b[0] - a[0]) * (j - a[1]) - (b[1] - a[1]) * (i - a[0]);
        if (length > 0) expect(Math.abs(cross) / length).toBeLessThanOrEqual(Math.SQRT1_2 + 1e-9);
      }
    }
  });

  it('rechaza celdas inválidas y líneas absurdamente largas', () => {
    expect(() => lineCells([0, 0], [0.5, 2])).toThrow(RangeError);
    expect(() => lineCells([Number.NaN, 0], [1, 1])).toThrow(RangeError);
    expect(() => lineCells([0, 0], [Number.POSITIVE_INFINITY, 0])).toThrow(RangeError);
    expect(() => lineCells([0, 0], [MAX_CELL_COORD, 0])).toThrow(RangeError);
    expect(() => lineCells([0, 0], [MAX_LINE_CELLS, 0])).toThrow(RangeError);
    expect(lineCells([0, 0], [MAX_LINE_CELLS - 1, 0]).length).toBe(MAX_LINE_CELLS);
  });
});

describe('rasterizePolygon', () => {
  const grid = createHectareGrid(ORIGIN);

  it('un rectángulo alineado con la grilla da exactamente sus celdas', () => {
    const geometry = localPolygon(grid, [
      [0, 0],
      [300, 0],
      [300, 200],
      [0, 200],
    ]);
    expect(sortedKeys(rasterizePolygon(grid, geometry))).toEqual(
      sortedKeys(cellsFromArt(['###', '###'])),
    );
  });

  it('una celda entra solo si su centro queda adentro', () => {
    // el borde derecho pasa apenas después del centro de la columna 2 y el de arriba apenas antes
    // del centro de la fila 1
    const geometry = localPolygon(grid, [
      [0, 0],
      [251, 0],
      [251, 149],
      [0, 149],
    ]);
    expect(sortedKeys(rasterizePolygon(grid, geometry))).toEqual(sortedKeys(cellsFromArt(['###'])));
  });

  it('no depende del sentido de giro del polígono', () => {
    const ring: XY[] = [
      [-200, -100],
      [200, -100],
      [200, 300],
      [-200, 300],
    ];
    const counterclockwise = rasterizePolygon(grid, localPolygon(grid, ring));
    const clockwise = rasterizePolygon(grid, localPolygon(grid, [...ring].reverse()));
    expect(counterclockwise.size).toBe(16);
    expect(clockwise.equals(counterclockwise)).toBe(true);
    expect(counterclockwise.bounds()).toEqual({ minI: -2, maxI: 1, minJ: -1, maxJ: 2 });
  });

  it('respeta los huecos', () => {
    const geometry = localPolygon(
      grid,
      [
        [0, 0],
        [500, 0],
        [500, 300],
        [0, 300],
      ],
      [
        [100, 100],
        [100, 200],
        [200, 200],
        [200, 100],
      ],
      [
        [300, 100],
        [300, 200],
        [400, 200],
        [400, 100],
      ],
    );
    expect(sortedKeys(rasterizePolygon(grid, geometry))).toEqual(
      sortedKeys(cellsFromArt(['#####', '#.#.#', '#####'])),
    );
  });

  it('un triángulo toma las celdas con el centro adentro', () => {
    // triángulo rectángulo con la hipotenusa sobre la diagonal de un cuadrado de 400 m
    const geometry = localPolygon(grid, [
      [0, 0],
      [400, 0],
      [0, 400],
    ]);
    // los centros sobre la hipotenusa quedan justo en el borde: se corren medio metro adentro
    const inside = localPolygon(grid, [
      [0, 0],
      [401, 0],
      [0, 401],
    ]);
    expect(sortedKeys(rasterizePolygon(grid, inside))).toEqual(
      sortedKeys(cellsFromArt(['#...', '##..', '###.', '####'])),
    );
    expect(rasterizePolygon(grid, geometry).size).toBeLessThanOrEqual(10);
  });

  it('con la grilla rotada devuelve las celdas con las que se armó el polígono', () => {
    const rotated = createHectareGrid(ORIGIN, { cellSize: 50, rotationDeg: 37 });
    for (const cell of [
      [0, 0],
      [-3, 5],
      [12, -7],
    ] as Cell[]) {
      const geometry = toPolygonGeometry(cellCornersLatLng(rotated, cell));
      expect([...rasterizePolygon(rotated, geometry)]).toEqual([cell]);
    }
  });

  it('un lote trazado por vértices se vuelve celdas de una grilla rotada', () => {
    const rotated = createHectareGrid(ORIGIN, { rotationDeg: 45 });
    // rectángulo de 600 m por 300 m alineado con la grilla rotada, corrido 10 m de las líneas
    const geometry = localPolygon(rotated, [
      [10, 10],
      [610, 10],
      [610, 310],
      [10, 310],
    ]);
    const cells = rasterizePolygon(rotated, geometry);
    expect(cells.size).toBe(18);
    expect(cells.bounds()).toEqual({ minI: 0, maxI: 5, minJ: 0, maxJ: 2 });
    // la misma forma sobre una grilla sin rotar ocupa una superficie parecida, en otras celdas
    const plain = rasterizePolygon(grid, geometry);
    expect(plain.size).toBeGreaterThanOrEqual(15);
    expect(plain.size).toBeLessThanOrEqual(21);
  });

  it('un polígono más chico que una celda puede no tomar ninguna', () => {
    const tiny = localPolygon(grid, [
      [10, 10],
      [40, 10],
      [40, 40],
      [10, 40],
    ]);
    expect(rasterizePolygon(grid, tiny).size).toBe(0);
    const aroundCenter = localPolygon(grid, [
      [40, 40],
      [60, 40],
      [60, 60],
      [40, 60],
    ]);
    expect([...rasterizePolygon(grid, aroundCenter)]).toEqual([[0, 0]]);
  });

  it('una geometría sin puntos o degenerada no da celdas', () => {
    expect(rasterizePolygon(grid, { type: 'Polygon', coordinates: [] }).size).toBe(0);
    expect(rasterizePolygon(grid, { type: 'Polygon', coordinates: [[]] }).size).toBe(0);
    const line = localPolygon(grid, [
      [0, 50],
      [500, 50],
    ]);
    expect(rasterizePolygon(grid, line).size).toBe(0);
  });

  it('rechaza un polígono demasiado grande en vez de colgar la pestaña', () => {
    // 150 km por 150 km: 2.250.000 celdas de una hectárea
    const huge = localPolygon(grid, [
      [0, 0],
      [150_000, 0],
      [150_000, 150_000],
      [0, 150_000],
    ]);
    expect(() => rasterizePolygon(grid, huge)).toThrow(RangeError);
  });
});

describe('rasterizeRings', () => {
  it('trabaja en unidades de celda', () => {
    const cells = rasterizeRings([
      [
        [0, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 3],
        [0, 3],
      ],
    ]);
    expect(sortedKeys(cells)).toEqual(sortedKeys(cellsFromArt(['#.', '#.', '##'])));
  });

  it('un vértice justo a la altura del centro de una fila no rompe la cuenta de bordes', () => {
    // rombo con los cuatro vértices sobre centros de celda. las celdas con el centro justo sobre
    // el borde entran por los lados de la izquierda y quedan afuera por los de la derecha
    const cells = rasterizeRings([
      [
        [0.5, 2.5],
        [2.5, 0.5],
        [4.5, 2.5],
        [2.5, 4.5],
      ],
    ]);
    expect(sortedKeys(cells)).toEqual(
      sortedKeys(cellsFromArt(['.....', '.##..', '####.', '.##..', '.....'])),
    );
  });

  it('dos polígonos vecinos no se quedan los dos con la celda del borde compartido', () => {
    // el lado compartido pasa justo por los centros de la columna 2, y el borde de abajo y el de
    // arriba por los centros de las filas 0 y 3
    const left = rasterizeRings([
      [
        [0.5, 0.5],
        [2.5, 0.5],
        [2.5, 3.5],
        [0.5, 3.5],
      ],
    ]);
    const right = rasterizeRings([
      [
        [2.5, 0.5],
        [4.5, 0.5],
        [4.5, 3.5],
        [2.5, 3.5],
      ],
    ]);
    expect(sortedKeys(left)).toEqual(sortedKeys(cellsFromArt(['.....', '##...', '##...', '##...'])));
    expect(sortedKeys(right)).toEqual(
      sortedKeys(cellsFromArt(['.....', '..##.', '..##.', '..##.'])),
    );
  });
});
