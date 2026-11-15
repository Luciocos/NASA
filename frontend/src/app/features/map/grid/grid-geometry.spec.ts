import { LatLngTuple, createLocalFrame, ringSignedArea } from '../../../core/geo/local-frame';
import { geometryAreaHa } from '../geo';
import { CellSet } from './cell-set';
import {
  cellsAreaHa,
  cellsPerimeterM,
  cellsToGeometry,
  regionOutlines,
  regridCells,
} from './grid-geometry';
import { cellCornersLatLng, createHectareGrid, vertexLatLng } from './hectare-grid';
import { rasterizePolygon } from './raster';
import { isSingleRegion } from './regions';
import { cellsFromArt, sortedKeys } from './testing';
import { GridShapeError } from './trace';

const ORIGIN: LatLngTuple = [-33.05, -61.2];

const DONUT = `
  ###
  #.#
  ###
`;

/** anillo geojson [lng, lat] como puntos [x, y] sin el cierre, para medir su sentido de giro */
function openLngLat(ring: number[][]): [number, number][] {
  return ring.slice(0, -1).map(([lng, lat]) => [lng, lat]);
}

describe('cellsToGeometry', () => {
  it('arma un polígono geojson cerrado, con pares [longitud, latitud] de 6 decimales', () => {
    const grid = createHectareGrid(ORIGIN);
    const geometry = cellsToGeometry(grid, cellsFromArt(['##', '##']));
    expect(geometry.type).toBe('Polygon');
    expect(geometry.coordinates.length).toBe(1);
    const ring = geometry.coordinates[0];
    expect(ring.length).toBe(5);
    expect(ring[4]).toEqual(ring[0]);
    // la esquina inferior izquierda de la celda [0, 0] es el origen de la grilla
    expect(ring[0]).toEqual([-61.2, -33.05]);
    for (const [lng, lat] of ring) {
      expect(lng).toBe(Math.round(lng * 1e6) / 1e6);
      expect(lat).toBe(Math.round(lat * 1e6) / 1e6);
    }
    // 200 m al este y 200 m al norte
    expect(ring[2][0]).toBeCloseTo(-61.2 + 200 / 93400.47, 5);
    expect(ring[2][1]).toBeCloseTo(-33.05 + 200 / 110905.35, 5);
  });

  it('el exterior gira en sentido antihorario y los huecos en horario, también con rotación', () => {
    for (const rotationDeg of [0, 37, 45, 120, -75]) {
      const grid = createHectareGrid(ORIGIN, { rotationDeg });
      const geometry = cellsToGeometry(grid, cellsFromArt(DONUT));
      expect(geometry.coordinates.length).toBe(2);
      const [exterior, hole] = geometry.coordinates.map(openLngLat);
      expect(exterior.length).toBe(4);
      expect(hole.length).toBe(4);
      expect(ringSignedArea(exterior)).toBeGreaterThan(0);
      expect(ringSignedArea(hole)).toBeLessThan(0);
    }
  });

  it('los vértices coinciden con las esquinas de las celdas', () => {
    const grid = createHectareGrid(ORIGIN, { cellSize: 50, rotationDeg: 37 });
    const geometry = cellsToGeometry(grid, new CellSet([[4, -2]]));
    const corners = cellCornersLatLng(grid, [4, -2]);
    geometry.coordinates[0].slice(0, 4).forEach(([lng, lat], k) => {
      expect(lat).toBeCloseTo(corners[k][0], 6);
      expect(lng).toBeCloseTo(corners[k][1], 6);
    });
  });

  it('en un pellizco el exterior y el hueco comparten exactamente el mismo punto', () => {
    for (const rotationDeg of [0, 37]) {
      const grid = createHectareGrid(ORIGIN, { cellSize: 50, rotationDeg });
      // el vértice [2, 1] es de los dos anillos
      const geometry = cellsToGeometry(
        grid,
        cellsFromArt(`
          ###
          #.#
          ##.
        `),
      );
      const [exterior, hole] = geometry.coordinates;
      const shared = exterior.filter((point) =>
        hole.some((other) => other[0] === point[0] && other[1] === point[1]),
      );
      expect(shared.length).toBe(1);
      const [lat, lng] = vertexLatLng(grid, [2, 1]);
      expect(shared[0][0]).toBeCloseTo(lng, 6);
      expect(shared[0][1]).toBeCloseTo(lat, 6);
    }
  });

  it('volver a celdas el polígono devuelve las mismas celdas', () => {
    const cells = cellsFromArt(`
      ####.#
      #.#.##
      ##.#.#
      #.####
      ####..
    `);
    for (const rotationDeg of [0, 37]) {
      for (const cellSize of [50, 100]) {
        const grid = createHectareGrid(ORIGIN, { cellSize, rotationDeg });
        const back = rasterizePolygon(grid, cellsToGeometry(grid, cells));
        expect(sortedKeys(back)).toEqual(sortedKeys(cells));
      }
    }
  });

  it('sin celdas lanza un error que dice que no hay nada marcado', () => {
    const grid = createHectareGrid(ORIGIN);
    expect(() => cellsToGeometry(grid, new CellSet())).toThrow(GridShapeError);
    expect(() => cellsToGeometry(grid, new CellSet())).toThrow('No squares painted.');
  });

  it('con más de una región lanza un error que lo explica', () => {
    const grid = createHectareGrid(ORIGIN);
    for (const art of [['#.#'], ['#.', '.#']]) {
      let thrown: unknown;
      try {
        cellsToGeometry(grid, cellsFromArt(art));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(GridShapeError);
      expect((thrown as GridShapeError).problem).toBe('multiple-regions');
      expect((thrown as GridShapeError).message).toContain('more than one block');
    }
  });
});

describe('superficie y perímetro de las celdas', () => {
  it('la superficie es la cantidad de celdas por la superficie de una', () => {
    const cells = cellsFromArt(['###']);
    expect(cellsAreaHa(cells, 100)).toBe(3);
    expect(cellsAreaHa(cells, 50)).toBe(0.75);
    expect(cellsAreaHa(new CellSet(), 100)).toBe(0);
    expect(cellsAreaHa(cellsFromArt(DONUT), 100)).toBe(8);
  });

  it('el perímetro suma el contorno de afuera y el de los huecos', () => {
    expect(cellsPerimeterM(new CellSet(), 100)).toBe(0);
    expect(cellsPerimeterM(cellsFromArt(['#']), 100)).toBe(400);
    expect(cellsPerimeterM(cellsFromArt(['#']), 50)).toBe(200);
    expect(cellsPerimeterM(cellsFromArt(['##', '##']), 100)).toBe(800);
    expect(cellsPerimeterM(cellsFromArt(['#.', '#.', '##']), 100)).toBe(1000);
    // 12 lados por afuera y 4 por el hueco
    expect(cellsPerimeterM(cellsFromArt(DONUT), 100)).toBe(1600);
    // dos celdas sueltas: se suman los dos contornos
    expect(cellsPerimeterM(cellsFromArt(['#.#']), 100)).toBe(800);
  });

  it('la superficie del polígono coincide con la de las celdas', () => {
    const cells = cellsFromArt(`
      .####.
      ##..##
      ##..##
      .####.
    `);
    for (const cellSize of [50, 100]) {
      for (const rotationDeg of [0, 37]) {
        const grid = createHectareGrid(ORIGIN, { cellSize, rotationDeg });
        const geometry = cellsToGeometry(grid, cells);
        const nominal = cellsAreaHa(cells, cellSize);
        expect(nominal).toBe((16 * cellSize * cellSize) / 10_000);
        // el redondeo a 6 decimales (unos 10 cm) mueve el área hasta un 0,1 % en celdas de 50 m
        expect(Math.abs(geometryAreaHa(geometry) - nominal) / nominal).toBeLessThan(0.002);
      }
    }
  });
});

describe('regionOutlines', () => {
  it('devuelve un grupo de anillos por región, con los huecos después del exterior', () => {
    const grid = createHectareGrid(ORIGIN, { rotationDeg: 37 });
    const cells = cellsFromArt(`
      ###..#
      #.#...
      ###...
    `);
    const outlines = regionOutlines(grid, cells);
    expect(outlines.length).toBe(2);
    // primero la región más grande: la dona con su hueco
    expect(outlines[0].length).toBe(2);
    expect(outlines[0][0].length).toBe(4);
    expect(outlines[0][1].length).toBe(4);
    expect(outlines[1].length).toBe(1);
    expect(outlines[1][0]).toEqual(cellCornersLatLng(grid, [5, 2]));
    expect(outlines[0][0][0]).toEqual(vertexLatLng(grid, [0, 0]));
    expect(outlines[0][1][0]).toEqual(vertexLatLng(grid, [1, 1]));
  });

  it('sin celdas no hay contornos', () => {
    expect(regionOutlines(createHectareGrid(ORIGIN), new CellSet())).toEqual([]);
  });
});

describe('regridCells', () => {
  const coarse = createHectareGrid(ORIGIN, { cellSize: 100, rotationDeg: 37 });
  const fine = createHectareGrid(ORIGIN, { cellSize: 50, rotationDeg: 37 });

  it('sobre la misma grilla devuelve las mismas celdas', () => {
    const cells = cellsFromArt(`
      ###.#
      #.###
      ###..
    `);
    expect(sortedKeys(regridCells(coarse, cells, coarse))).toEqual(sortedKeys(cells));
  });

  it('pasar de 100 m a 50 m da cuatro celdas por cada una', () => {
    const cells = new CellSet([
      [0, 0],
      [1, 0],
      [-2, 3],
    ]);
    const finer = regridCells(coarse, cells, fine);
    expect(finer.size).toBe(12);
    expect(sortedKeys(finer)).toEqual(
      sortedKeys([
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 0],
        [3, 0],
        [2, 1],
        [3, 1],
        [-4, 6],
        [-3, 6],
        [-4, 7],
        [-3, 7],
      ]),
    );
    expect(cellsAreaHa(finer, 50)).toBe(cellsAreaHa(cells, 100));
  });

  it('pasar de 50 m a 100 m pinta las celdas que tenían dos cuartos o más', () => {
    // sobre la grilla fina: la celda gruesa [0, 0] tiene sus 4 cuartos, la [1, 0] tiene 2, la
    // [2, 0] tiene 1 y la [0, 1] tiene 3
    const cells = new CellSet([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 0],
      [2, 1],
      [4, 0],
      [0, 2],
      [1, 2],
      [0, 3],
    ]);
    expect(sortedKeys(regridCells(fine, cells, coarse))).toEqual(
      sortedKeys([
        [0, 0],
        [1, 0],
        [0, 1],
      ]),
    );
  });

  it('ir a 50 m y volver a 100 m no cambia nada', () => {
    const cells = cellsFromArt(`
      .###.
      ##.##
      .###.
    `);
    const back = regridCells(fine, regridCells(coarse, cells, fine), coarse);
    expect(sortedKeys(back)).toEqual(sortedKeys(cells));
  });

  it('al cambiar la rotación conserva la forma de manera aproximada', () => {
    const block = new CellSet();
    for (let j = 0; j < 12; j++) {
      for (let i = 0; i < 20; i++) block.addAt(i, j);
    }
    const plain = createHectareGrid(ORIGIN, { cellSize: 100 });
    const turned = regridCells(coarse, block, plain);
    // 240 ha: la cantidad de celdas cambia poco y sigue siendo un solo bloque
    expect(Math.abs(turned.size - block.size)).toBeLessThanOrEqual(12);
    expect(isSingleRegion(turned)).toBe(true);
    // y cae en el mismo lugar del mapa: el centro del bloque queda dentro de lo pintado
    const center = createLocalFrame(ORIGIN, 37).toLatLng([1000, 600]);
    const [x, y] = plain.frame.toLocal(center);
    expect(turned.has([Math.floor(x / 100), Math.floor(y / 100)])).toBe(true);
  });

  it('pasa cada región por separado y no pierde las que están sueltas', () => {
    const cells = cellsFromArt(['#.#', '...', '#.#']);
    const finer = regridCells(coarse, cells, fine);
    expect(finer.size).toBe(16);
  });

  it('sin celdas no devuelve nada', () => {
    expect(regridCells(coarse, new CellSet(), fine).size).toBe(0);
  });
});
