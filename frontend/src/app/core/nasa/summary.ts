import type { PolygonGeometry } from '../models';
import { centroid, pointInPolygon, round } from './geo';
import type {
  NdviGrid,
  NdviObservation,
  NdviPixel,
  NdviQuality,
  NdviSummary,
  NdviZone,
  NdviZoneLevel,
  NdviZones,
} from './models';

const DAY_MS = 86_400_000;

/** píxel usable: con valor y sin nubes ni nieve (0 bueno, 1 marginal) */
export function isValidPixel(p: NdviPixel): boolean {
  return p.value !== null && (p.reliability === 0 || p.reliability === 1);
}

function nearestPixel(pixels: NdviPixel[], [lat, lng]: [number, number]): NdviPixel | null {
  const k = Math.cos((lat * Math.PI) / 180);
  let best: NdviPixel | null = null;
  let bestD = Infinity;
  for (const p of pixels) {
    const d = (p.center[0] - lat) ** 2 + ((p.center[1] - lng) * k) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * NDVI de un lote en una grilla: promedio de los píxeles cuyo centro cae dentro del polígono
 * (respetando huecos); si no cae ninguno, el píxel del centroide con centroidOnly true
 */
export function observeLot(grid: NdviGrid, geometry: PolygonGeometry): NdviObservation {
  let candidates = grid.pixels.filter((p) => pointInPolygon(p.center, geometry));
  const centroidOnly = candidates.length === 0;
  if (centroidOnly) {
    const nearest = nearestPixel(grid.pixels, centroid(geometry));
    candidates = nearest ? [nearest] : [];
  }
  const valid = candidates.filter(isValidPixel);
  const values = valid.map((p) => p.value as number);
  let quality: NdviQuality;
  if (valid.length) quality = valid.every((p) => p.reliability === 0) ? 'good' : 'marginal';
  else quality = candidates.some((p) => p.reliability === 3) ? 'cloudy' : 'no_data';
  return {
    date: grid.date,
    satellite: grid.satellite,
    mean: values.length ? round(values.reduce((s, v) => s + v, 0) / values.length, 4) : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    pixels: candidates.length,
    validPixels: valid.length,
    quality,
    centroidOnly,
  };
}

/**
 * último valor y sus variaciones: contra el compuesto inmediatamente anterior y contra el de la
 * misma época del año anterior, solo si ambos tienen valor; nunca se interpola
 */
export function ndviSummary(history: NdviObservation[]): NdviSummary {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.filter((o) => o.mean !== null).at(-1) ?? null;
  if (!latest) {
    return {
      latest: null,
      previous: null,
      lastYear: null,
      changeVsPrevious: null,
      changeVsLastYear: null,
    };
  }
  const latestMs = Date.parse(latest.date);
  const sameSat = sorted.filter((o) => o.satellite === latest.satellite);
  // el compuesto anterior empieza 16 días antes (13 o 14 en el cambio de año)
  const before = sameSat.filter((o) => o.date < latest.date).at(-1);
  const previous =
    before && before.mean !== null && latestMs - Date.parse(before.date) <= 17 * DAY_MS
      ? before
      : null;
  const target = latestMs - 365 * DAY_MS;
  const lastYear =
    sameSat.find((o) => o.mean !== null && Math.abs(Date.parse(o.date) - target) <= 8 * DAY_MS) ??
    null;
  const diff = (other: NdviObservation | null) =>
    other && other.mean !== null && latest.mean !== null
      ? round(latest.mean - other.mean, 4)
      : null;
  return {
    latest,
    previous,
    lastYear,
    changeVsPrevious: diff(previous),
    changeVsLastYear: diff(lastYear),
  };
}

const ZONE_LABELS: Record<NdviZoneLevel, string> = {
  alto: 'NDVI alto',
  medio: 'NDVI medio',
  bajo: 'NDVI bajo',
};

/**
 * ambientes del lote: el rango entre el mínimo y el máximo de los píxeles válidos del lote se parte
 * en tres partes iguales (alto, medio, bajo); no hay umbrales fijos
 */
export function zonesByTerciles(grid: NdviGrid): NdviZones {
  const valid = grid.pixels.filter((p) => p.inside && isValidPixel(p));
  const values = valid.map((p) => p.value as number);
  const base = { date: grid.date, validPixels: valid.length };
  if (valid.length < 3) {
    return {
      ...base,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      zones: [],
      note: 'Hacen falta al menos 3 píxeles de 250 m válidos dentro del lote para separar ambientes.',
    };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range <= 0) {
    return { ...base, min, max, zones: [], note: 'El NDVI es parejo en todo el lote.' };
  }
  const cut1 = min + range / 3;
  const cut2 = min + (2 * range) / 3;
  const levelOf = (v: number): NdviZoneLevel => (v >= cut2 ? 'alto' : v >= cut1 ? 'medio' : 'bajo');
  const bounds: Record<NdviZoneLevel, [number, number]> = {
    alto: [cut2, max],
    medio: [cut1, cut2],
    bajo: [min, cut1],
  };
  const zones: NdviZone[] = (['alto', 'medio', 'bajo'] as const).map((level) => {
    const pixels = valid.filter((p) => levelOf(p.value as number) === level);
    return {
      level,
      label: ZONE_LABELS[level],
      from: round(bounds[level][0], 4),
      to: round(bounds[level][1], 4),
      pixels,
      share: round(pixels.length / valid.length, 4),
    };
  });
  return { ...base, min, max, zones, note: null };
}
