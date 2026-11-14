/*
 * grilla de hectáreas: el modo "pintar hectáreas" del alta de un lote
 *
 * lógica pura, sin angular ni leaflet. el recorrido completo:
 *   const grid = createHectareGrid([lat, lng], { cellSize: 100, rotationDeg: 45 });
 *   const editor = new GridEditor();
 *   editor.beginStroke('paint');
 *   editor.strokeTo(cellAt(grid, [lat, lng])); // en cada movimiento del puntero
 *   editor.endStroke();
 *   if (isSingleRegion(editor.cells)) geometry = cellsToGeometry(grid, editor.cells);
 */
export type { LatLngBox, LatLngTuple, LocalFrame, XY } from '../../../core/geo/local-frame';
export { CellSet, MAX_CELL_COORD, isValidCell } from './cell-set';
export type { ReadonlyCellSet } from './cell-set';
export { GridEditor } from './grid-editor';
export type { StrokeMode } from './grid-editor';
export {
  cellsAreaHa,
  cellsPerimeterM,
  cellsToGeometry,
  regionOutlines,
  regridCells,
} from './grid-geometry';
export {
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
export type { Cell, CellRange, GridVertex, HectareGrid, HectareGridOptions } from './hectare-grid';
export {
  MAX_LINE_CELLS,
  MAX_RASTER_CELLS,
  lineCells,
  rasterizePolygon,
  rasterizeRings,
} from './raster';
export { components, isSingleRegion } from './regions';
export { GridShapeError, traceRings } from './trace';
export type { GridShapeProblem, TracedRings } from './trace';
