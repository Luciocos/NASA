// api pública del motor isométrico: las pantallas importan desde acá

export { EventGlyph } from './event-glyph';
export { ISO_GLYPHS, ISO_GLYPH_PATHS, isoGlyphPath } from './glyphs';
export { IsoScene } from './iso-scene';
export { describeLotVisual } from './lot-visual';
export type { LotVisual, LotVisualInput } from './lot-visual';
export { ISO_COVERS } from './model';
export type {
  IsoCamera,
  IsoCover,
  IsoGlyph,
  IsoLot,
  IsoLotStatus,
  IsoMarker,
  IsoPoint,
  IsoRing,
  IsoRotation,
  IsoTone,
  IsoViewChange,
} from './model';
export { fitCamera, scaleBar } from './projection';
export { IsoRenderer } from './renderer';
export { geometryToIsoRings, isoFrameFor } from './geo-bridge';
