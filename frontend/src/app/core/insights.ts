// lecturas compartidas sobre las campañas y la bitácora de un lote
// son funciones puras: no piden nada a la red ni inventan valores

/** claves de `metrics` que hoy entrega el pipeline (pipeline/README.md), con su rótulo */
export const METRIC_LABELS: Record<string, string> = {
  hh_anomaly_change_db: 'Cambio de HH frente al paisaje',
  hv_anomaly_change_db: 'Cambio de HV frente al paisaje',
  threshold_db: 'Umbral de detección',
  threshold_rule: 'Regla del umbral',
  threshold_validated: 'Umbral validado',
  dates_compared: 'Fechas comparadas',
  nisar_product: 'Producto NISAR',
  nisar_track: 'Órbita NISAR',
  ndvi_before: 'NDVI antes',
  ndvi_before_date: 'Fecha del NDVI anterior',
  ndvi_last: 'NDVI más reciente',
  ndvi_last_date: 'Fecha del NDVI más reciente',
  optical_sensor: 'Sensor óptico',
};

/** unidad de las métricas numéricas conocidas (vacío: sin unidad) */
export const METRIC_UNITS: Record<string, string> = {
  hh_anomaly_change_db: 'dB',
  hv_anomaly_change_db: 'dB',
  threshold_db: 'dB',
};

/** última campaña por etiqueta: "2025/26" ordena bien como texto */
export function latestCampaign<T extends { label: string }>(campaigns: readonly T[]): T | null {
  let latest: T | null = null;
  for (const campaign of campaigns) {
    if (latest === null || campaign.label > latest.label) latest = campaign;
  }
  return latest;
}

/** último evento por fecha; a igual fecha gana el de id mayor (el orden de la bitácora) */
export function lastEvent<T extends { id: number; date: string }>(events: readonly T[]): T | null {
  let last: T | null = null;
  for (const event of events) {
    if (
      last === null ||
      event.date > last.date ||
      (event.date === last.date && event.id > last.id)
    ) {
      last = event;
    }
  }
  return last;
}

/** valor numérico de una métrica libre del evento; null si falta o no es un número finito */
export function numberMetric(
  event: { metrics: Record<string, unknown> },
  key: string,
): number | null {
  const value = event.metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** valor de texto de una métrica libre del evento; null si falta o está vacío */
export function textMetric(
  event: { metrics: Record<string, unknown> },
  key: string,
): string | null {
  const value = event.metrics[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** evento más reciente que trae esa métrica numérica, con su valor */
export function latestWithMetric<
  T extends { id: number; date: string; metrics: Record<string, unknown> },
>(events: readonly T[], key: string): { event: T; value: number } | null {
  let found: { event: T; value: number } | null = null;
  for (const event of events) {
    const value = numberMetric(event, key);
    if (value === null) continue;
    if (
      found === null ||
      event.date > found.event.date ||
      (event.date === found.event.date && event.id > found.event.id)
    ) {
      found = { event, value };
    }
  }
  return found;
}

/** cuántos eventos hay por origen, para mostrar con qué respaldo cuenta la bitácora */
export function countByOrigin<O extends string>(
  items: readonly { origin: O }[],
  origins: readonly O[],
): Record<O, number> {
  const counts = Object.fromEntries(origins.map((origin) => [origin, 0])) as Record<O, number>;
  for (const item of items) {
    if (item.origin in counts) counts[item.origin] += 1;
  }
  return counts;
}

/** "86,7 ha": superficie con un decimal en formato de Argentina */
export function formatHectares(hectares: number): string {
  return `${hectares.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ha`;
}
