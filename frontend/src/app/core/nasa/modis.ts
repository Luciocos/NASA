import type { PolygonGeometry } from '../models';
import { pointInPolygon, round, sinusoidalToLatLng } from './geo';
import type { NasaHttp } from './http';
import type { LandCoverYear, LatLng, NdviGrid, NdviPixel } from './models';
import { IGBP_LABELS } from './sources';

export const ORNL_BASE = 'https://modis.ornl.gov/rst/api/v1';
export const NDVI_BAND = '250m_16_days_NDVI';
export const RELIABILITY_BAND = '250m_16_days_pixel_reliability';
/** ORNL rechaza rangos de más de 10 fechas ("exceeds maximum subset tiles support of 10") */
export const ORNL_MAX_DATES = 10;
export const MODIS_CELL_M = 231.656358264;

const NDVI_FILL = -3000;
const COMPOSITES_PER_YEAR = 23;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** pasado este tiempo un compuesto ya no se reprocesa: su copia no vence */
const SETTLED_MS = 60 * DAY_MS;

export type ModisProduct = 'MOD13Q1' | 'MYD13Q1';

export const MODIS_SATELLITE: Record<ModisProduct, 'Terra' | 'Aqua'> = {
  MOD13Q1: 'Terra',
  MYD13Q1: 'Aqua',
};

// los compuestos de 16 días arrancan siempre en los mismos días del año; Aqua va 8 días corrido
const FIRST_DOY: Record<ModisProduct, number> = { MOD13Q1: 1, MYD13Q1: 9 };

export interface ModisDate {
  /** AAAADDD con prefijo A, como lo pide ORNL */
  modisDate: string;
  calendarDate: string;
  /** posición en el calendario de compuestos (año * 23 + número de compuesto) */
  index: number;
}

/** kilómetros pedidos hacia cada lado del centro */
export interface ModisWindow {
  center: LatLng;
  kmNs: number;
  kmEw: number;
}

export interface OrnlSubset {
  xllcorner: string | number;
  yllcorner: string | number;
  cellsize: string | number;
  nrows: number;
  ncols: number;
  scale?: string;
  subset: { modis_date: string; calendar_date: string; band: string; data: number[] }[];
}

const pad3 = (n: number) => String(n).padStart(3, '0');
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function compositeFromIndex(product: ModisProduct, index: number): ModisDate {
  const year = Math.floor(index / COMPOSITES_PER_YEAR);
  const doy = FIRST_DOY[product] + 16 * (index % COMPOSITES_PER_YEAR);
  return {
    modisDate: `A${year}${pad3(doy)}`,
    calendarDate: isoDay(Date.UTC(year, 0, doy)),
    index,
  };
}

/** índice del compuesto que contiene la fecha (el último que empezó ese día o antes) */
export function compositeIndexAt(product: ModisProduct, iso: string): number {
  const year = Number(iso.slice(0, 4));
  const doy = Math.round((Date.parse(iso.slice(0, 10)) - Date.UTC(year, 0, 1)) / DAY_MS) + 1;
  const k = Math.floor((doy - FIRST_DOY[product]) / 16);
  if (k < 0) return year * COMPOSITES_PER_YEAR - 1;
  return year * COMPOSITES_PER_YEAR + Math.min(k, COMPOSITES_PER_YEAR - 1);
}

export function modisDateIndex(product: ModisProduct, modisDate: string): number {
  const year = Number(modisDate.slice(1, 5));
  const doy = Number(modisDate.slice(5));
  return year * COMPOSITES_PER_YEAR + Math.floor((doy - FIRST_DOY[product]) / 16);
}

/**
 * tandas de compuestos alineadas a bloques fijos de 10 del calendario, de la más nueva a la más
 * vieja: cada tanda entra en un pedido y su url no cambia con el tiempo, así la copia sirve
 */
export function compositeBatches(
  product: ModisProduct,
  fromIso: string,
  toIso: string,
): ModisDate[][] {
  // incluye el compuesto que contiene la fecha inicial
  const from = compositeIndexAt(product, fromIso);
  const to = compositeIndexAt(product, toIso);
  const batches: ModisDate[][] = [];
  for (let hi = to; hi >= from;) {
    const lo = Math.max(from, Math.floor(hi / ORNL_MAX_DATES) * ORNL_MAX_DATES);
    const batch: ModisDate[] = [];
    for (let i = lo; i <= hi; i++) batch.push(compositeFromIndex(product, i));
    batches.push(batch);
    hi = lo - 1;
  }
  return batches;
}

/** agrupa fechas sueltas en rangos de a lo sumo 10 compuestos, alineados como compositeBatches */
export function batchDates(product: ModisProduct, dates: string[]): ModisDate[][] {
  const groups = new Map<number, ModisDate[]>();
  const indexes = [...new Set(dates.map((d) => modisDateIndex(product, d)))].sort((a, b) => b - a);
  for (const index of indexes) {
    const block = Math.floor(index / ORNL_MAX_DATES);
    groups.set(block, [...(groups.get(block) ?? []), compositeFromIndex(product, index)]);
  }
  return [...groups.values()].map((g) => g.sort((a, b) => a.index - b.index));
}

/** ventana mínima en km enteros que cubre una distancia desde el centro, con la grilla de 250 m */
export function windowKm(halfExtentKm: number): number {
  for (let km = 0; km < 100; km++) {
    if (Math.floor((km * 1000) / MODIS_CELL_M) * MODIS_CELL_M >= halfExtentKm * 1000) return km;
  }
  return 100;
}

/** valor NDVI escalado, o null si es relleno o está fuera de rango */
function ndviValue(raw: number | undefined, scale: number): number | null {
  if (raw === undefined || raw === NDVI_FILL || raw < -2000 || raw > 10000) return null;
  return round(raw * scale, 4);
}

/**
 * arma las grillas georreferenciadas de un subset de NDVI y su banda de confiabilidad
 * las filas vienen de norte a sur y las columnas de oeste a este (verificado sobre el río Paraná
 * frente a Rosario, ver modis.spec.ts); xllcorner e yllcorner son la esquina inferior izquierda
 */
export function parseNdviSubset(
  ndvi: OrnlSubset,
  reliability: OrnlSubset | null,
  product: ModisProduct,
  geometry: PolygonGeometry | null = null,
): NdviGrid[] {
  const xll = Number(ndvi.xllcorner);
  const yll = Number(ndvi.yllcorner);
  const cs = Number(ndvi.cellsize);
  const scale = Number(ndvi.scale) || 0.0001;
  const { nrows, ncols } = ndvi;
  const relByDate = new Map((reliability?.subset ?? []).map((s) => [s.modis_date, s.data]));
  return ndvi.subset
    .filter((s) => s.band === NDVI_BAND)
    .map((entry) => {
      const rel = relByDate.get(entry.modis_date);
      const pixels: NdviPixel[] = [];
      for (let r = 0; r < nrows; r++) {
        const yTop = yll + (nrows - r) * cs;
        for (let c = 0; c < ncols; c++) {
          const i = r * ncols + c;
          const x0 = xll + c * cs;
          const center = sinusoidalToLatLng(x0 + cs / 2, yTop - cs / 2);
          const relValue = rel?.[i];
          pixels.push({
            ring: [
              sinusoidalToLatLng(x0, yTop),
              sinusoidalToLatLng(x0 + cs, yTop),
              sinusoidalToLatLng(x0 + cs, yTop - cs),
              sinusoidalToLatLng(x0, yTop - cs),
            ],
            center,
            value: ndviValue(entry.data[i], scale),
            reliability: relValue === undefined ? null : relValue,
            inside: geometry ? pointInPolygon(center, geometry) : false,
          });
        }
      }
      return {
        date: entry.calendar_date,
        satellite: MODIS_SATELLITE[product],
        cellSizeM: cs,
        pixels,
      };
    });
}

export interface ModisFetched<T> {
  data: T;
  stale: boolean;
  savedAt: string;
}

/** subsets MODIS del ORNL DAAC: NDVI de 16 días, confiabilidad y cobertura del suelo */
export class ModisClient {
  constructor(
    private readonly http: NasaHttp,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** fechas publicadas para un punto (el pedido es lento: unos 40 a 60 s) */
  async availableDates(
    point: LatLng,
    product: ModisProduct = 'MOD13Q1',
  ): Promise<ModisFetched<ModisDate[]>> {
    const [lat, lng] = point.map((v) => round(v, 4));
    const res = await this.http.get<{ dates: { modis_date: string; calendar_date: string }[] }>({
      url: `${ORNL_BASE}/${product}/dates?latitude=${lat}&longitude=${lng}`,
      service: 'ornl',
      maxAgeMs: 12 * HOUR_MS,
      headers: { Accept: 'application/json' },
    });
    const data = (res.body.dates ?? []).map((d) => ({
      modisDate: d.modis_date,
      calendarDate: d.calendar_date,
      index: modisDateIndex(product, d.modis_date),
    }));
    return { data, stale: res.stale, savedAt: res.savedAt };
  }

  /** una tanda (a lo sumo 10 compuestos consecutivos): NDVI y confiabilidad en paralelo */
  async ndviBatch(
    window: ModisWindow,
    batch: ModisDate[],
    options: { product?: ModisProduct; geometry?: PolygonGeometry; priority?: 'high' | 'low' } = {},
  ): Promise<ModisFetched<NdviGrid[]>> {
    const product = options.product ?? 'MOD13Q1';
    if (!batch.length)
      return { data: [], stale: false, savedAt: new Date(this.now()).toISOString() };
    const first = batch[0];
    const last = batch.at(-1) ?? first;
    if (last.index - first.index >= ORNL_MAX_DATES) throw new Error('la tanda supera 10 fechas');
    const settled = Date.parse(last.calendarDate) + 16 * DAY_MS + SETTLED_MS < this.now();
    const [lat, lng] = window.center.map((v) => round(v, 4));
    const url = (band: string) =>
      `${ORNL_BASE}/${product}/subset?latitude=${lat}&longitude=${lng}&band=${band}` +
      `&startDate=${first.modisDate}&endDate=${last.modisDate}` +
      `&kmAboveBelow=${window.kmNs}&kmLeftRight=${window.kmEw}`;
    const request = (band: string) =>
      this.http.get<OrnlSubset>({
        url: url(band),
        service: 'ornl',
        maxAgeMs: settled ? Infinity : 12 * HOUR_MS,
        headers: { Accept: 'application/json' },
        priority: options.priority,
      });
    const [ndvi, rel] = await Promise.all([request(NDVI_BAND), request(RELIABILITY_BAND)]);
    const wanted = new Set(batch.map((d) => d.modisDate));
    const body = { ...ndvi.body, subset: ndvi.body.subset.filter((s) => wanted.has(s.modis_date)) };
    return {
      data: parseNdviSubset(body, rel.body, product, options.geometry ?? null),
      stale: ndvi.stale || rel.stale,
      savedAt: ndvi.savedAt < rel.savedAt ? ndvi.savedAt : rel.savedAt,
    };
  }

  /** grillas de varias fechas, partidas en tandas de 10; las tandas que fallan se informan */
  async ndviGrids(
    window: ModisWindow,
    dates: string[],
    options: { product?: ModisProduct; geometry?: PolygonGeometry } = {},
  ): Promise<ModisFetched<NdviGrid[]> & { failedBatches: number }> {
    const batches = batchDates(options.product ?? 'MOD13Q1', dates);
    const results = await Promise.allSettled(
      batches.map((b) => this.ndviBatch(window, b, options)),
    );
    const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const failedBatches = results.length - ok.length;
    if (!ok.length && failedBatches) throw (results[0] as PromiseRejectedResult).reason;
    return {
      data: ok.flatMap((r) => r.data).sort((a, b) => a.date.localeCompare(b.date)),
      stale: ok.some((r) => r.stale),
      savedAt: ok.map((r) => r.savedAt).sort()[0] ?? new Date(this.now()).toISOString(),
      failedBatches,
    };
  }

  /** clase IGBP anual (MCD12Q1 LC_Type1) del píxel de 500 m que contiene el punto */
  async landCover(point: LatLng, fromYear = 2020): Promise<ModisFetched<LandCoverYear[]>> {
    const toYear = new Date(this.now()).getUTCFullYear();
    const [lat, lng] = point.map((v) => round(v, 4));
    const requests = [];
    for (let start = fromYear; start <= toYear; start += ORNL_MAX_DATES) {
      const end = Math.min(toYear, start + ORNL_MAX_DATES - 1);
      requests.push(
        this.http.get<OrnlSubset>({
          url:
            `${ORNL_BASE}/MCD12Q1/subset?latitude=${lat}&longitude=${lng}&band=LC_Type1` +
            `&startDate=A${start}001&endDate=A${end}001&kmAboveBelow=0&kmLeftRight=0`,
          service: 'ornl',
          maxAgeMs: 7 * 24 * HOUR_MS,
          headers: { Accept: 'application/json' },
        }),
      );
    }
    const responses = await Promise.all(requests);
    const data = responses
      .flatMap((r) => r.body.subset)
      .map((s): LandCoverYear => {
        const raw = s.data[0];
        const label = raw === undefined ? undefined : IGBP_LABELS[raw];
        return {
          year: Number(s.calendar_date.slice(0, 4)),
          classId: label ? raw : null,
          label: label ?? 'Sin clasificar',
        };
      })
      .sort((a, b) => a.year - b.year);
    return {
      data,
      stale: responses.some((r) => r.stale),
      savedAt: responses.map((r) => r.savedAt).sort()[0],
    };
  }
}
