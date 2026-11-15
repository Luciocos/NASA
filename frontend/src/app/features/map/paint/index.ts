/*
 * modo "pintar hectáreas" del alta de un lote: modelo, capa canvas de leaflet, gestos y piezas
 * de interfaz. la grilla y sus cuentas viven en ../grid
 */
export { PAINT_MIN_ZOOM, PaintLayer } from './paint-layer';
export type { GhostMode } from './paint-layer';
export { PaintHud } from './paint-hud';
export type { PaintTool } from './paint-hud';
export { PaintPointer } from './paint-pointer';
export type { PaintPointerHandlers } from './paint-pointer';
export {
  MAX_ROTATION_DEG,
  MIN_ROTATION_DEG,
  PaintSession,
  clampRotation,
  gridAngleFor,
  longestSideDeg,
} from './paint-session';
export type { PaintCellSize, PaintSnapshot } from './paint-session';
