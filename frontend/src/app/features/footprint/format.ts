import { ConfidenceLevel, CriterionStatus } from '../../core/models';

/** Texto fijo de la pantalla. Nunca usar las palabras "certificado" ni "certificación". */
export const ESTIMATE_NOTICE = 'Estimación con respaldo satelital. Prueba de concepto.';

/** Estado de un criterio con símbolo y texto: el significado no depende solo del color. */
export const CRITERION_STATUS: Record<CriterionStatus, { icon: string; label: string }> = {
  cumple: { icon: '✓', label: 'Cumple' },
  no_cumple: { icon: '✗', label: 'No cumple' },
  sin_dato: { icon: '?', label: 'Sin dato' },
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  ALTO: 'Alto',
  BAJO: 'Bajo',
  'SIN DATOS': 'Sin datos',
};

export function formatNumber(value: number | null, digits = 1): string {
  return value === null
    ? 'Sin dato'
    : value.toLocaleString('es-AR', { maximumFractionDigits: digits });
}

export function formatKgPerTonne(value: number | null): string {
  return value === null ? 'Sin dato' : `${formatNumber(value)} kg CO2e/t`;
}

/** "2026-11-14T10:00:00-03:00" -> "14/11/2026 10:00", en hora de Argentina. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
