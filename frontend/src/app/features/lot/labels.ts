import { EventLogItem, EventType, Sensor } from '../../core/models';

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

export function formatConfidence(confidence: number | null): string | null {
  return confidence === null ? null : `${Math.round(confidence * 100)} %`;
}
