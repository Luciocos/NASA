import type { PolygonGeometry } from '../models';
import { cellOverlap, latLngToSinusoidal, round, sinusoidalToLatLng } from './geo';
import type { NasaHttp, NasaResponse } from './http';
import type { LandCoverYear, LatLng, NdviGrid, NdviPixel } from './models';
import { IGBP_LABELS } from './sources';

export const ORNL_BASE = 'https://modis.ornl.gov/rst/api/v1';
export const NDVI_BAND = '250m_16_days_NDVI';
export const RELIABILITY_BAND = '250m_16_days_pixel_reliability';
export const LANDCOVER_BAND = 'LC_Type1';
/** ORNL rechaza rangos de más de 10 fechas ("exceeds maximum subset tiles support of 10") */
export const ORNL_MAX_DATES = 10;
export const MODIS_CELL_M = 231.656358264;
/** lado del píxel de MCD12Q1 (500 m nominales) en la grilla sinusoidal */
export const LANDCOVER_CELL_M = 463.312716528;
/** tope de km por lado de la ventana de cobertura: 21 x 21 píxeles, unos 9,7 km de lado */
export const LANDCOVER_MAX_KM = 5;

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

/**
 * ventana mínima en km enteros que cubre una distancia desde el centro: ORNL suma
 * floor(km * 1000 / lado) píxeles a cada lado del que contiene el centro (grilla de 250 m si no
 * se indica el lado)
 */
export function windowKm(halfExtentKm: number, cellM = MODIS_CELL_M): number {
  for (let km = 0; km < 100; km++) {
    if (Math.floor((km * 1000) / cellM) * cellM >= halfExtentKm * 1000) return km;
  }
  return 100;
}

/**
 * ventana de la grilla de cobertura (500 m) que cubre el polígono, con un tope de km por lado
 * se mide en metros de la proyección sinusoidal: sus columnas se inclinan respecto de los
 * meridianos (en Casilda, unos 580 m hacia el este por cada km hacia el norte), así que la caja en
 * grados no alcanza. el centro va redondeado como en la url, para medir desde el punto pedido.
 * clipped avisa que el lote no entra en la ventana y quedó afuera una parte
 */
export function landCoverWindow(
  geometry: PolygonGeometry,
  maxKm = LANDCOVER_MAX_KM,
): ModisWindow & { clipped: boolean } {
  const points = (geometry.coordinates[0] ?? []).map(([lng, lat]) =>
    latLngToSinusoidal([lat, lng]),
  );
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [lat, lng] = sinusoidalToLatLng(
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  );
  const center: LatLng = [round(lat, 4), round(lng, 4)];
  const [cx, cy] = latLngToSinusoidal(center);
  const kmEw = windowKm(Math.max(...xs.map((x) => Math.abs(x - cx))) / 1000, LANDCOVER_CELL_M);
  const kmNs = windowKm(Math.max(...ys.map((y) => Math.abs(y - cy))) / 1000, LANDCOVER_CELL_M);
  return {
    center,
    kmNs: Math.min(kmNs, maxKm),
    kmEw: Math.min(kmEw, maxKm),
    clipped: kmNs > maxKm || kmEw > maxKm,
  };
}

/** geometría de la grilla de un subset, en metros de la proyección sinusoidal */
export interface SubsetGrid {
  /** esquina inferior izquierda de la grilla */
  xll: number;
  yll: number;
  cellSizeM: number;
  nrows: number;
  ncols: number;
}

export function subsetGrid(subset: OrnlSubset): SubsetGrid {
  return {
    xll: Number(subset.xllcorner),
    yll: Number(subset.yllcorner),
    cellSizeM: Number(subset.cellsize),
    nrows: subset.nrows,
    ncols: subset.ncols,
  };
}

/**
 * bordes del píxel i de data en la proyección: data recorre las filas de norte a sur y, en cada
 * fila, las columnas de oeste a este. verificado con datos reales en la costa de Rosario, con
 * NDVI y con cobertura del suelo (ver modis.spec.ts)
 */
function cellBounds(grid: SubsetGrid, index: number) {
  const row = Math.floor(index / grid.ncols);
  const col = index % grid.ncols;
  const x0 = grid.xll + col * grid.cellSizeM;
  const yTop = grid.yll + (grid.nrows - row) * grid.cellSizeM;
  return { x0, x1: x0 + grid.cellSizeM, yTop, yBottom: yTop - grid.cellSizeM };
}

/** centro del píxel i de data, en [lat, lng] */
export function cellCenter(grid: SubsetGrid, index: number): LatLng {
  const { x0, yTop } = cellBounds(grid, index);
  return sinusoidalToLatLng(x0 + grid.cellSizeM / 2, yTop - grid.cellSizeM / 2);
}

/** las cuatro esquinas del píxel i de data, desde la de arriba a la izquierda y en sentido horario */
export function cellRing(grid: SubsetGrid, index: number): LatLng[] {
  const { x0, x1, yTop, yBottom } = cellBounds(grid, index);
  return [
    sinusoidalToLatLng(x0, yTop),
    sinusoidalToLatLng(x1, yTop),
    sinusoidalToLatLng(x1, yBottom),
    sinusoidalToLatLng(x0, yBottom),
  ];
}

/** índice en data del píxel que contiene el punto, o null si cae fuera de la grilla */
export function cellAt(grid: SubsetGrid, point: LatLng): number | null {
  const [x, y] = latLngToSinusoidal(point);
  const col = Math.floor((x - grid.xll) / grid.cellSizeM);
  const fromBottom = Math.floor((y - grid.yll) / grid.cellSizeM);
  if (col < 0 || col >= grid.ncols || fromBottom < 0 || fromBottom >= grid.nrows) return null;
  return (grid.nrows - 1 - fromBottom) * grid.ncols + col;
}

/** valor NDVI escalado, o null si es relleno o está fuera de rango */
function ndviValue(raw: number | undefined, scale: number): number | null {
  if (raw === undefined || raw === NDVI_FILL || raw < -2000 || raw > 10000) return null;
  return round(raw * scale, 4);
}

/**
 * arma las grillas georreferenciadas de un subset de NDVI y su banda de confiabilidad
 * las filas vienen de norte a sur y las columnas de oeste a este (ver cellBounds)
 */
export function parseNdviSubset(
  ndvi: OrnlSubset,
  reliability: OrnlSubset | null,
  product: ModisProduct,
  geometry: PolygonGeometry | null = null,
): NdviGrid[] {
  const grid = subsetGrid(ndvi);
  const scale = Number(ndvi.scale) || 0.0001;
  const relByDate = new Map((reliability?.subset ?? []).map((s) => [s.modis_date, s.data]));
  // la geometría de cada píxel y su recorte con el lote no cambian entre fechas: una sola vez
  const cells = Array.from({ length: grid.nrows * grid.ncols }, (_, i) => {
    const ring = cellRing(grid, i);
    const overlap = geometry ? cellOverlap(ring, geometry) : null;
    const insideHa = overlap?.areaHa ?? 0;
    return {
      ring,
      center: cellCenter(grid, i),
      inside: insideHa > 0,
      insideHa,
      // la grilla sinusoidal es de área igual: el cuadro mide cellSizeM² en el terreno
      insideShare: Math.min(1, insideHa / (grid.cellSizeM ** 2 / 10_000)),
      clip: overlap?.rings ?? [],
    };
  });
  return ndvi.subset
    .filter((s) => s.band === NDVI_BAND)
    .map((entry) => {
      const rel = relByDate.get(entry.modis_date);
      const pixels: NdviPixel[] = cells.map((cell, i) => {
        const relValue = rel?.[i];
        return {
          ...cell,
          value: ndviValue(entry.data[i], scale),
          reliability: relValue === undefined ? null : relValue,
        };
      });
      return {
        date: entry.calendar_date,
        satellite: MODIS_SATELLITE[product],
        cellSizeM: grid.cellSizeM,
        pixels,
      };
    });
}

/** clase IGBP de un año en cada píxel de la grilla de cobertura */
export interface LandCoverGridYear {
  year: number;
  /** en el orden de data; null si es relleno (255, sin clasificar) o un valor fuera de 1 a 17 */
  classes: (number | null)[];
}

/** grilla de cobertura del suelo MCD12Q1 de una ventana, con un mapa por año */
export interface LandCoverGrid extends SubsetGrid {
  years: LandCoverGridYear[];
}

/** arma la grilla de cobertura de un subset de LC_Type1, con los años en orden */
export function parseLandCoverSubset(subset: OrnlSubset): LandCoverGrid {
  const grid = subsetGrid(subset);
  const years = subset.subset
    .filter((s) => s.band === LANDCOVER_BAND)
    .map((s) => ({
      year: Number(s.calendar_date.slice(0, 4)),
      classes: Array.from({ length: grid.nrows * grid.ncols }, (_, i) => {
        const raw = s.data[i];
        return raw !== undefined && IGBP_LABELS[raw] ? raw : null;
      }),
    }))
    .sort((a, b) => a.year - b.year);
  return { ...grid, years };
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
    const responses = await this.landCoverSubsets({ center: point, kmNs: 0, kmEw: 0 }, fromYear);
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

  /**
   * clases IGBP anuales (MCD12Q1 LC_Type1) de todos los píxeles de 500 m de la ventana, desde
   * fromYear hasta el último mapa publicado (el del año en curso sale recién el año siguiente)
   */
  async landCoverGrid(window: ModisWindow, fromYear = 2020): Promise<ModisFetched<LandCoverGrid>> {
    const responses = await this.landCoverSubsets(window, fromYear);
    // la misma ventana da la misma grilla en cada pedido: solo se juntan los años
    const grids = responses.map((r) => parseLandCoverSubset(r.body));
    if (!grids[0]) throw new Error(`no hay mapas de cobertura desde ${fromYear}`);
    return {
      data: { ...grids[0], years: grids.flatMap((g) => g.years).sort((a, b) => a.year - b.year) },
      stale: responses.some((r) => r.stale),
      savedAt: responses.map((r) => r.savedAt).sort()[0],
    };
  }

  /** LC_Type1 de una ventana desde fromYear hasta el año en curso, en pedidos de a 10 años */
  private landCoverSubsets(
    window: ModisWindow,
    fromYear: number,
  ): Promise<NasaResponse<OrnlSubset>[]> {
    const toYear = new Date(this.now()).getUTCFullYear();
    const [lat, lng] = window.center.map((v) => round(v, 4));
    const requests: Promise<NasaResponse<OrnlSubset>>[] = [];
    for (let start = fromYear; start <= toYear; start += ORNL_MAX_DATES) {
      const end = Math.min(toYear, start + ORNL_MAX_DATES - 1);
      requests.push(
        this.http.get<OrnlSubset>({
          url:
            `${ORNL_BASE}/MCD12Q1/subset?latitude=${lat}&longitude=${lng}&band=${LANDCOVER_BAND}` +
            `&startDate=A${start}001&endDate=A${end}001` +
            `&kmAboveBelow=${window.kmNs}&kmLeftRight=${window.kmEw}`,
          service: 'ornl',
          // el mapa de un año sale durante el siguiente: la copia se renueva cada semana
          maxAgeMs: 7 * 24 * HOUR_MS,
          headers: { Accept: 'application/json' },
        }),
      );
    }
    return Promise.all(requests);
  }
}
