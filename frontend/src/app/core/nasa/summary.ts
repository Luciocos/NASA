import type { PolygonGeometry } from '../models';
import { CellOverlap, cellOverlap, centroid, geometryKey, round } from './geo';
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

/**
 * píxel mixto: más de la mitad del cuadro de 250 m queda fuera del lote, así que su NDVI refleja
 * sobre todo lo que hay alrededor (el campo vecino, un camino). Es la regla de la mayoría, no un
 * umbral calibrado
 */
export function isMixedPixel(p: NdviPixel): boolean {
  return p.insideShare !== undefined && p.insideShare < 0.5;
}

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

// el recorte de cada píxel con el lote se repite en cada fecha: se guarda por lote y píxel
const overlapCache = new Map<string, CellOverlap>();

function overlapOf(p: NdviPixel, geometry: PolygonGeometry, lotKey: string): CellOverlap {
  const key = `${lotKey}#${p.ring.map(([lat, lng]) => `${round(lat, 6)},${round(lng, 6)}`).join(';')}`;
  let overlap = overlapCache.get(key);
  if (!overlap) {
    if (overlapCache.size > 20_000) overlapCache.clear();
    overlap = cellOverlap(p.ring, geometry);
    overlapCache.set(key, overlap);
  }
  return overlap;
}

/**
 * NDVI de un lote en una grilla: promedio de los píxeles que tocan el polígono (respetando
 * huecos), ponderado por las hectáreas de cada píxel que caen dentro del lote. Un píxel que
 * apenas roza el borde pesa poco. Si ningún píxel toca el lote, el del centroide con
 * centroidOnly true
 */
export function observeLot(grid: NdviGrid, geometry: PolygonGeometry): NdviObservation {
  const lotKey = geometryKey(geometry);
  const weighted = grid.pixels
    .map((p) => ({ p, ha: overlapOf(p, geometry, lotKey).areaHa }))
    .filter((c) => c.ha > 0);
  const centroidOnly = weighted.length === 0;
  let candidates = weighted;
  if (centroidOnly) {
    const nearest = nearestPixel(grid.pixels, centroid(geometry));
    candidates = nearest ? [{ p: nearest, ha: 1 }] : [];
  }
  const valid = candidates.filter((c) => isValidPixel(c.p));
  const values = valid.map((c) => c.p.value as number);
  const totalHa = valid.reduce((sum, c) => sum + c.ha, 0);
  let quality: NdviQuality;
  if (valid.length) quality = valid.every((c) => c.p.reliability === 0) ? 'good' : 'marginal';
  else quality = candidates.some((c) => c.p.reliability === 3) ? 'cloudy' : 'no_data';
  return {
    date: grid.date,
    satellite: grid.satellite,
    mean:
      totalHa > 0
        ? round(valid.reduce((s, c) => s + (c.p.value as number) * c.ha, 0) / totalHa, 4)
        : null,
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
 * en tres partes iguales (alto, medio, bajo); no hay umbrales fijos. La parte de cada ambiente es
 * su superficie dentro del lote sobre la superficie válida, no la cuenta de píxeles
 */
export function zonesByTerciles(grid: NdviGrid): NdviZones {
  const valid = grid.pixels.filter((p) => p.inside && isValidPixel(p));
  // peso de cada píxel: sus hectáreas dentro del lote (las grillas sin recorte pesan parejo)
  const weight = (p: NdviPixel) => p.insideHa ?? 1;
  const validWeight = valid.reduce((sum, p) => sum + weight(p), 0);
  const values = valid.map((p) => p.value as number);
  const base = { date: grid.date, validPixels: valid.length };
  if (valid.length < 3) {
    return {
      ...base,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      zones: [],
      note: 'At least 3 valid 250 m pixels inside the field are needed to split it into zones.',
    };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range <= 0) {
    return { ...base, min, max, zones: [], note: 'NDVI is even across the whole field.' };
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
      share: round(pixels.reduce((sum, p) => sum + weight(p), 0) / validWeight, 4),
      mixedShare: round(
        pixels.filter(isMixedPixel).reduce((sum, p) => sum + weight(p), 0) / validWeight,
        4,
      ),
    };
  });
  return { ...base, min, max, zones, note: null };
}
