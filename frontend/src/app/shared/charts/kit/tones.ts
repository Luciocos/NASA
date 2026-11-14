import { Origin } from '../../../core/models';
import { ChartTone } from '../types';
import { MarkShape } from './paths';

/** trama con la que se rellena una marca de área */
export type Texture = 'solid' | 'hatch' | 'dots';

/**
 * trama de cada tono. es la segunda señal de los orígenes del dato y sigue un orden:
 * cuanto menos respaldo tiene el dato, menos tinta lleva su relleno
 */
export const TONE_TEXTURE: Record<ChartTone, Texture> = {
  neutral: 'solid',
  positive: 'solid',
  negative: 'solid',
  verified: 'solid',
  declared: 'hatch',
  estimated: 'dots',
  accent: 'solid',
  water: 'solid',
  soil: 'solid',
};

/** forma de la marca puntual de cada origen: círculo lleno, rombo y círculo hueco */
export const ORIGIN_SHAPE: Record<Origin, MarkShape> = {
  VERIFIED: 'circle',
  DECLARED: 'diamond',
  ESTIMATED: 'ring',
};

/** tonos que se reparten por orden fijo cuando una serie no trae el suyo */
export const SERIES_TONES: readonly ChartTone[] = ['water', 'accent', 'soil'];

/** formas que se reparten por orden fijo entre las series que no usan un tono de origen */
export const SERIES_SHAPES: readonly MarkShape[] = ['circle', 'square', 'triangle'];

const TONE_SHAPE: Partial<Record<ChartTone, MarkShape>> = {
  verified: ORIGIN_SHAPE.VERIFIED,
  declared: ORIGIN_SHAPE.DECLARED,
  estimated: ORIGIN_SHAPE.ESTIMATED,
};

/** forma fija de un tono de origen, o undefined si el tono no es de origen */
export function toneShape(tone: ChartTone): MarkShape | undefined {
  return TONE_SHAPE[tone];
}

/**
 * relleno de trama de un tono: referencia al <pattern> de la instancia, o null si el
 * tono es liso y alcanza con el color de su clase
 */
export function textureFill(uid: string, tone: ChartTone): string | null {
  return TONE_TEXTURE[tone] === 'solid' ? null : `url(#${uid}-${tone})`;
}

/** relleno de la trama neutra que marca un valor faltante */
export function noDataFill(uid: string): string {
  return `url(#${uid}-nodata)`;
}
