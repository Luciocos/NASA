import { EventLogItem, EventType, Origin, Sensor } from '../../core/models';

/** Tipos de evento en español, en el mismo orden que el backend (events/models.py). */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  SOWING: 'Siembra',
  HARVEST: 'Cosecha',
  TILLAGE: 'Remoción de suelo',
  COVER_CROP: 'Cultivo de cobertura',
  FLOODING: 'Anegamiento',
  BURN: 'Quema',
  LAND_USE_CHANGE: 'Cambio de uso del suelo',
};

/**
 * Nombre visible de cada sensor. Siempre el sensor real: un dato de Sentinel-1 no se
 * rotula como NISAR, y se aclara que no es dato NASA (CLAUDE.md, sección 12).
 */
export const SENSOR_LABELS: Record<Sensor, string> = {
  NISAR: 'NISAR (radar, banda L)',
  SENTINEL1: 'Sentinel-1 (radar, banda C, ESA: no es dato NASA)',
  HLS: 'HLS (óptico)',
  LANDSAT: 'Landsat (óptico)',
  MODIS: 'MODIS',
  VIIRS: 'VIIRS',
  SMAP: 'SMAP',
  MANUAL: 'Manual (sin sensor satelital)',
};

/**
 * El sensor en pocas palabras, para una fila de la bitácora. El detalle del evento usa
 * SENSOR_LABELS. Sentinel-1 sigue aclarando que no es dato NASA.
 */
export const SENSOR_SHORT_LABELS: Record<Sensor, string> = {
  NISAR: 'Radar NISAR',
  SENTINEL1: 'Sentinel-1 (ESA, no es dato NASA)',
  HLS: 'Óptico HLS',
  LANDSAT: 'Óptico Landsat',
  MODIS: 'MODIS',
  VIIRS: 'VIIRS',
  SMAP: 'SMAP',
  MANUAL: 'Manual',
};

/** Qué quiere decir el origen de un evento, en palabras: acompaña a app-origin-badge. */
export const EVENT_ORIGIN_MEANING: Record<Origin, string> = {
  VERIFIED: 'Lo observó un satélite.',
  DECLARED: 'Lo informó o lo confirmó el productor.',
  ESTIMATED: 'Es una estimación, no una observación directa.',
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
  return `${date} ± ${days} ${days === 1 ? 'día' : 'días'}`;
}

const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "2026-09-07" -> "7 sep 2026", en palabras y sin pasar por Date (no corre el día). */
export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${Number(day)} ${MONTHS_SHORT[Number(month) - 1]} ${year}`;
}

/** "2026-09-07" -> "Septiembre de 2026", para agrupar por mes. */
export function formatMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  const name = MONTHS[Number(month) - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
}

/** Margen de la fecha de detección: "± 6 días", o null si es exacta. */
export function formatUncertainty(days: number | null): string | null {
  return days ? `± ${days} ${days === 1 ? 'día' : 'días'}` : null;
}

/** "7 sep 2026 ± 6 días": la fecha de un evento en palabras, con su margen. */
export function formatEventDay(event: EventLogItem): string {
  const margin = formatUncertainty(event.date_uncertainty_days);
  return margin ? `${formatShortDate(event.date)} ${margin}` : formatShortDate(event.date);
}

export function formatConfidence(confidence: number | null): string | null {
  return confidence === null ? null : `${Math.round(confidence * 100)} %`;
}

/** 3.1 -> "3,1 t/ha": el rinde de una campaña. */
export function formatYield(tonnesPerHectare: number): string {
  return `${tonnesPerHectare.toLocaleString('es-AR', { maximumFractionDigits: 2 })} t/ha`;
}
