import { XY, geometryToLocalRings } from '../../../core/geo/local-frame';
import { PolygonGeometry } from '../../../core/models';
import { CellSet, isValidCell } from './cell-set';
import { Cell, HectareGrid } from './hectare-grid';

/** tope de celdas de una línea: más que esto no es un trazo, es un error de quien llama */
export const MAX_LINE_CELLS = 100_000;

/**
 * tope de celdas de la caja de un polígono: más que esto dejaría la pestaña colgada y sin memoria.
 * a 100 m por celda es una caja de 100 km por 100 km
 */
export const MAX_RASTER_CELLS = 1_000_000;

/**
 * todas las celdas de la línea que va de `a` a `b`, las dos incluidas y en orden
 *
 * cada celda comparte un lado con la anterior (nunca avanza en diagonal), así que un arrastre
 * rápido no deja huecos y lo pintado queda unido por lados. son `|di| + |dj| + 1` celdas
 *
 * @throws RangeError si alguna celda no es válida o si la línea pasa de MAX_LINE_CELLS celdas
 */
export function lineCells(a: Cell, b: Cell): Cell[] {
  if (!isValidCell(a[0], a[1]) || !isValidCell(b[0], b[1])) {
    throw new RangeError(
      `celdas inválidas para una línea: [${a[0]}, ${a[1]}] y [${b[0]}, ${b[1]}]`,
    );
  }
  const stepsI = Math.abs(b[0] - a[0]);
  const stepsJ = Math.abs(b[1] - a[1]);
  if (stepsI + stepsJ + 1 > MAX_LINE_CELLS) {
    throw new RangeError(`línea demasiado larga: ${stepsI + stepsJ + 1} celdas`);
  }
  const signI = b[0] > a[0] ? 1 : -1;
  const signJ = b[1] > a[1] ? 1 : -1;
  let i = a[0];
  let j = a[1];
  let doneI = 0;
  let doneJ = 0;
  const cells: Cell[] = [[i, j]];
  while (doneI < stepsI || doneJ < stepsJ) {
    // avanza por el eje que cruza antes su próximo borde de celda. es comparar
    // (doneI + 0.5) / stepsI con (doneJ + 0.5) / stepsJ sin dividir. si empatan, primero i
    const stepI =
      doneJ >= stepsJ || (doneI < stepsI && (2 * doneI + 1) * stepsJ <= (2 * doneJ + 1) * stepsI);
    if (stepI) {
      i += signI;
      doneI++;
    } else {
      j += signJ;
      doneJ++;
    }
    cells.push([i, j]);
  }
  return cells;
}

/**
 * celdas cuyo centro cae dentro del polígono, respetando los huecos
 *
 * sirve para pasar a celdas un lote trazado por vértices y para volver a celdas un polígono
 * armado con cellsToGeometry sobre la misma grilla (devuelve exactamente las mismas). un lote
 * más angosto que una celda puede no devolver ninguna
 *
 * devuelve cerca de `area_ha * 10_000 / cellSize ** 2` celdas: para mostrar un lote muy grande
 * conviene una grilla de celdas más grandes
 *
 * @throws RangeError si la caja del polígono abarca más de MAX_RASTER_CELLS celdas
 */
export function rasterizePolygon(grid: HectareGrid, geometry: PolygonGeometry): CellSet {
  const rings = geometryToLocalRings(grid.frame, geometry).map((ring) =>
    ring.map(([x, y]): XY => [x / grid.cellSize, y / grid.cellSize]),
  );
  return rasterizeRings(rings);
}

/**
 * igual que rasterizePolygon, con los anillos ya en unidades de celda (metros locales divididos
 * por el tamaño de celda). cuenta como adentro lo que queda encerrado por una cantidad impar de
 * bordes, así que el sentido de giro de los anillos no importa
 *
 * @throws RangeError si la caja de los anillos abarca más de MAX_RASTER_CELLS celdas
 */
export function rasterizeRings(rings: readonly (readonly Readonly<XY>[])[]): CellSet {
  const cells = new CellSet();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (minY > maxY) return cells; // no hay ningún punto
  // en unidades de celda, la superficie de la caja es el máximo de celdas que puede salir
  const boxCells = (maxX - minX) * (maxY - minY);
  if (boxCells > MAX_RASTER_CELLS) {
    throw new RangeError(
      `polígono demasiado grande para la grilla: ${Math.round(boxCells)} celdas`,
    );
  }
  // filas cuyo centro (j + 0.5) queda entre el punto más bajo y el más alto
  for (let j = Math.ceil(minY - 0.5); j + 0.5 < maxY; j++) {
    const y = j + 0.5;
    const crossings: number[] = [];
    for (const ring of rings) {
      for (let k = 0; k < ring.length; k++) {
        const [x1, y1] = ring[k];
        const [x2, y2] = ring[(k + 1) % ring.length];
        // un borde cuenta si sus extremos quedan a distinto lado de la fila. el <= de un solo
        // lado hace que un vértice justo sobre la fila se cuente una vez y no dos
        if (y1 <= y !== y2 <= y) crossings.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    crossings.sort((p, q) => p - q);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      // columnas cuyo centro (i + 0.5) cae en [crossings[k], crossings[k + 1])
      const last = Math.ceil(crossings[k + 1] - 0.5) - 1;
      for (let i = Math.ceil(crossings[k] - 0.5); i <= last; i++) cells.addAt(i, j);
    }
  }
  return cells;
}
