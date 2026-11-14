import { LatLngTuple, XY, ringsToGeometry } from '../../../core/geo/local-frame';
import { PolygonGeometry } from '../../../core/models';
import { CellSet, ReadonlyCellSet } from './cell-set';
import { GridVertex, HectareGrid, vertexLatLng } from './hectare-grid';
import { rasterizeRings } from './raster';
import { components } from './regions';
import { traceRings } from './trace';

/**
 * polígono geojson de las celdas pintadas, listo para mandar en el alta del lote
 *
 * las celdas tienen que formar una sola región (unidas por un lado). los huecos se conservan. el
 * polígono cumple con lo que valida el backend (shapely is_valid) y con el sentido de giro de
 * rfc 7946, que es el que necesita el backend para restar los huecos al calcular la superficie
 *
 * @example
 * if (isSingleRegion(editor.cells)) {
 *   api.createLot({ name, geometry: cellsToGeometry(grid, editor.cells) });
 * }
 *
 * @throws GridShapeError si no hay celdas (`problem: 'empty'`) o si forman más de una región
 * (`problem: 'multiple-regions'`)
 */
export function cellsToGeometry(grid: HectareGrid, cells: ReadonlyCellSet): PolygonGeometry {
  const { exterior, holes } = traceRings(cells);
  const toLocal = (vertex: GridVertex): XY => [
    vertex[0] * grid.cellSize,
    vertex[1] * grid.cellSize,
  ];
  return ringsToGeometry(grid.frame, [exterior.map(toLocal), ...holes.map((h) => h.map(toLocal))]);
}

/**
 * superficie de las celdas pintadas en hectáreas: cantidad de celdas por la superficie de una
 *
 * es el valor nominal, para mostrar mientras se pinta. el que queda guardado lo calcula el
 * backend sobre el polígono y puede diferir en el segundo decimal
 */
export function cellsAreaHa(cells: ReadonlyCellSet, cellSize: number): number {
  return (cells.size * cellSize * cellSize) / 10_000;
}

/** perímetro de lo pintado en metros: el contorno de afuera más el de los huecos */
export function cellsPerimeterM(cells: ReadonlyCellSet, cellSize: number): number {
  let sides = 0;
  cells.forEach((i, j) => {
    if (!cells.hasAt(i + 1, j)) sides++;
    if (!cells.hasAt(i - 1, j)) sides++;
    if (!cells.hasAt(i, j + 1)) sides++;
    if (!cells.hasAt(i, j - 1)) sides++;
  });
  return sides * cellSize;
}

/**
 * contornos de todo lo pintado en [lat, lng], para dibujarlos mientras se pinta
 *
 * devuelve un elemento por región (de la más grande a la más chica), y cada uno es una lista de
 * anillos: primero el exterior y después los huecos. es el formato de multipolígono de
 * `L.polygon`. a diferencia de cellsToGeometry acepta varias regiones y no redondea
 */
export function regionOutlines(grid: HectareGrid, cells: ReadonlyCellSet): LatLngTuple[][][] {
  return components(cells).map((region) => {
    const { exterior, holes } = traceRings(region);
    return [exterior, ...holes].map((ring) => ring.map((vertex) => vertexLatLng(grid, vertex)));
  });
}

/**
 * pasa lo pintado en una grilla a otra grilla (otro tamaño de celda, otra rotación u otro origen)
 *
 * una celda nueva queda pintada si lo pintado cubre al menos la mitad de ella, medido en los
 * centros de sus cuatro cuartos. con el mismo marco, pasar de 100 m a 50 m es exacto (cada celda
 * da cuatro) y pasar de 50 m a 100 m pinta las celdas que tenían dos cuartos o más. al cambiar
 * la rotación el resultado es aproximado y puede dejar de ser una sola región
 *
 * @example
 * const finer = createHectareGrid(grid.frame.origin, { cellSize: 50, rotationDeg });
 * editor.replaceAll(regridCells(grid, editor.cells, finer));
 */
export function regridCells(from: HectareGrid, cells: ReadonlyCellSet, to: HectareGrid): CellSet {
  // se rasteriza al doble de resolución: cada media celda es uno de los cuatro cuartos
  const halfCell = to.cellSize / 2;
  const quarters = new CellSet();
  for (const region of components(cells)) {
    const { exterior, holes } = traceRings(region);
    const rings = [exterior, ...holes].map((ring) =>
      ring.map((vertex): XY => {
        const [x, y] = to.frame.toLocal(vertexLatLng(from, vertex));
        return [x / halfCell, y / halfCell];
      }),
    );
    rasterizeRings(rings).forEach((i, j) => quarters.addAt(i, j));
  }
  const result = new CellSet();
  quarters.forEach((qi, qj) => {
    const i = Math.floor(qi / 2);
    const j = Math.floor(qj / 2);
    if (result.hasAt(i, j)) return;
    const covered =
      Number(quarters.hasAt(2 * i, 2 * j)) +
      Number(quarters.hasAt(2 * i + 1, 2 * j)) +
      Number(quarters.hasAt(2 * i, 2 * j + 1)) +
      Number(quarters.hasAt(2 * i + 1, 2 * j + 1));
    if (covered >= 2) result.addAt(i, j);
  });
  return result;
}
