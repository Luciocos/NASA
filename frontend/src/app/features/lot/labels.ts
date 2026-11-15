import { EventLogItem, EventType, Origin, Sensor } from '../../core/models';

/** Tipos de evento en inglés, en el mismo orden que el backend (events/models.py). */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  SOWING: 'Sowing',
  HARVEST: 'Harvest',
  TILLAGE: 'Tillage',
  COVER_CROP: 'Cover crop',
  FLOODING: 'Flooding',
  BURN: 'Burning',
  LAND_USE_CHANGE: 'Land use change',
};

/**
 * Nombre visible de cada sensor. Siempre el sensor real: un dato de Sentinel-1 no se
 * rotula como NISAR, y se aclara que no es dato NASA (CLAUDE.md, sección 12).
 */
export const SENSOR_LABELS: Record<Sensor, string> = {
  NISAR: 'NISAR (radar, L-band)',
  SENTINEL1: 'Sentinel-1 (radar, C-band, ESA: not NASA data)',
  HLS: 'HLS (optical)',
  LANDSAT: 'Landsat (optical)',
  MODIS: 'MODIS',
  VIIRS: 'VIIRS',
  SMAP: 'SMAP',
  MANUAL: 'Manual (no satellite sensor)',
};

/**
 * El sensor en pocas palabras, para una fila de la bitácora. El detalle del evento usa
 * SENSOR_LABELS. Sentinel-1 sigue aclarando que no es dato NASA.
 */
export const SENSOR_SHORT_LABELS: Record<Sensor, string> = {
  NISAR: 'NISAR radar',
  SENTINEL1: 'Sentinel-1 (ESA, not NASA data)',
  HLS: 'HLS optical',
  LANDSAT: 'Landsat optical',
  MODIS: 'MODIS',
  VIIRS: 'VIIRS',
  SMAP: 'SMAP',
  MANUAL: 'Manual',
};

/** Qué quiere decir el origen de un evento, en palabras: acompaña a app-origin-badge. */
export const EVENT_ORIGIN_MEANING: Record<Origin, string> = {
  VERIFIED: 'A satellite observed it.',
  DECLARED: 'The farmer reported or confirmed it.',
  ESTIMATED: 'It is an estimate, not a direct observation.',
};

/** Los tres orígenes, en el orden en que los explica la ayuda. */
export const ORIGINS: readonly Origin[] = ['VERIFIED', 'DECLARED', 'ESTIMATED'];

export const RADAR_SENSORS: readonly Sensor[] = ['NISAR', 'SENTINEL1'];

export const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];
export const SENSORS = Object.keys(SENSOR_LABELS) as Sensor[];

/** "2026-10-12" -> "12/10/2026", sin pasar por Date para no correr el día por zona horaria. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function formatEventDate(event: EventLogItem): string {
  const date = formatDate(event.date);
  const days = event.date_uncertainty_days;
  if (!days) {
    return date;
  }
  return `${date} ± ${days} ${days === 1 ? 'day' : 'days'}`;
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-09-07" -> "7 Sep 2026", en palabras y sin pasar por Date (no corre el día). */
export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${Number(day)} ${MONTHS_SHORT[Number(month) - 1]} ${year}`;
}

/** "2026-09-07" -> "September 2026", para agrupar por mes. */
export function formatMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  const name = MONTHS[Number(month) - 1];
  return `${name} ${year}`;
}

/** Margen de la fecha de detección: "± 6 days", o null si es exacta. */
export function formatUncertainty(days: number | null): string | null {
  return days ? `± ${days} ${days === 1 ? 'day' : 'days'}` : null;
}

/** "7 Sep 2026 ± 6 days": la fecha de un evento en palabras, con su margen. */
export function formatEventDay(event: EventLogItem): string {
  const margin = formatUncertainty(event.date_uncertainty_days);
  return margin ? `${formatShortDate(event.date)} ${margin}` : formatShortDate(event.date);
}

export function formatConfidence(confidence: number | null): string | null {
  return confidence === null ? null : `${Math.round(confidence * 100)}%`;
}

/** 3.1 -> "3.1 t/ha": el rinde de una campaña. */
export function formatYield(tonnesPerHectare: number): string {
  return `${tonnesPerHectare.toLocaleString('en-US', { maximumFractionDigits: 2 })} t/ha`;
}
