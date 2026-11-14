import { Crop, EventType, Origin } from '../../core/models';
import { IsoCover, IsoMarker, IsoTone } from './model';

/** lo que se sabe de un lote a la hora de elegir su ilustración */
export interface LotVisualInput {
  /** cultivo de la última campaña, si se conoce */
  crop?: Crop | null;
  /** último evento de la bitácora, si hay alguno */
  lastEvent?: { type: EventType; origin: Origin; isSimulated: boolean } | null;
}

/** ilustración de un lote: se copia tal cual a cover, crop y marker de un IsoLot */
export interface LotVisual {
  cover: IsoCover;
  crop: Crop | null;
  marker: IsoMarker | null;
}

const COVER_BY_EVENT: Record<EventType, IsoCover> = {
  SOWING: 'sown',
  HARVEST: 'stubble',
  TILLAGE: 'tilled',
  COVER_CROP: 'cover',
  FLOODING: 'flooded',
  BURN: 'burnt',
  LAND_USE_CHANGE: 'bare',
};

const TONE_BY_ORIGIN: Record<Origin, IsoTone> = {
  VERIFIED: 'verified',
  DECLARED: 'declared',
  ESTIMATED: 'estimated',
};

/**
 * traduce el estado conocido de un lote a su ilustración en la maqueta
 *
 * regla, por el último evento registrado:
 *
 * | último evento   | cover     |
 * |-----------------|-----------|
 * | SOWING          | 'sown'    |
 * | HARVEST         | 'stubble' |
 * | TILLAGE         | 'tilled'  |
 * | COVER_CROP      | 'cover'   |
 * | FLOODING        | 'flooded' |
 * | BURN            | 'burnt'   |
 * | LAND_USE_CHANGE | 'bare'    |
 *
 * sin eventos: 'crop' si se conoce el cultivo de la campaña, y 'bare' si no se sabe nada
 *
 * el marcador lleva el glifo del último evento, el tono según su origen (VERIFIED, DECLARED,
 * ESTIMATED) y la marca de dato simulado. sin eventos no hay marcador
 *
 * el resultado es una ilustración del último dato registrado, no una observación del estado
 * actual del lote: no dice cómo está hoy el campo ni mide nada. la pantalla que la use tiene
 * que mostrar además el evento con su fecha, su sensor y su origen
 *
 * @example
 * const visual = describeLotVisual({
 *   crop: 'SOY',
 *   lastEvent: { type: 'HARVEST', origin: 'VERIFIED', isSimulated: false },
 * });
 * // { cover: 'stubble', crop: 'SOY', marker: { glyph: 'HARVEST', tone: 'verified', simulated: false } }
 */
export function describeLotVisual(input: LotVisualInput): LotVisual {
  const crop = input.crop ?? null;
  const event = input.lastEvent ?? null;
  if (!event) {
    return { cover: crop ? 'crop' : 'bare', crop, marker: null };
  }
  return {
    cover: COVER_BY_EVENT[event.type] ?? 'unknown',
    crop,
    marker: {
      glyph: event.type,
      tone: TONE_BY_ORIGIN[event.origin] ?? 'neutral',
      simulated: event.isSimulated,
    },
  };
}
