import {
  InjectionToken,
  Service,
  inject,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';

import type { PolygonGeometry } from '../models';
import { type NasaClients, createNasaClients } from './clients';
import { bbox, centroid, geometryKey, halfExtentKm } from './geo';
import { NasaServiceError } from './http';
import { LAND_USE_BASELINE_YEAR, type LandUseEvidence, lotLandUse } from './land-use';
import type {
  ClimateDay,
  DateRange,
  LandCoverYear,
  LatLng,
  LoadState,
  LotRef,
  NdviGrid,
  NdviObservation,
  SceneList,
} from './models';
import {
  type ModisDate,
  type ModisWindow,
  ORNL_MAX_DATES,
  compositeBatches,
  compositeFromIndex,
  compositeIndexAt,
  landCoverWindow,
  windowKm,
} from './modis';
import { NO_DATA_REASONS } from './sources';
import { isValidPixel, observeLot } from './summary';

/** clientes de la NASA que usa la fachada; en las pruebas se reemplazan por dobles */
export const NASA_CLIENTS = new InjectionToken<NasaClients>('NASA_CLIENTS', {
  providedIn: 'root',
  factory: () => createNasaClients(),
});

const DAY_MS = 86_400_000;
/** semilado máximo de una ventana compartida por varios lotes */
const CLUSTER_MAX_HALF_KM = 6;
const HLS_LOOKBACK_DAYS = 120;
/** tras dos tandas seguidas sin respuesta se deja de insistir hasta un retry() */
const MAX_FAILED_IN_A_ROW = 2;
/**
 * sin novedades en este tiempo una consulta deja de mostrarse como "cargando": pasa a error (o a
 * parcial terminado, si ya llegó algo) con su motivo y se puede reintentar. el pedido no se corta:
 * si llega, se muestra. alcanza para dos intentos a ORNL, que corta los suyos a los 60 o 70 s, y
 * para esperar un lugar en la cola de ORNL (dos pedidos a la vez)
 */
export const STALLED_MS = 150_000;

export function idleState<T>(): LoadState<T> {
  return { status: 'idle', data: null, progress: 0, stale: false, updatedAt: null, error: null };
}

function loadingState<T>(data: T | null = null): LoadState<T> {
  return { status: 'loading', data, progress: 0, stale: false, updatedAt: null, error: null };
}

/** todavía esperando respuesta, como lo mira la interfaz: cargando, o parcial sin terminar */
function isPending(state: LoadState<unknown>): boolean {
  return state.status === 'loading' || (state.status === 'partial' && state.progress < 1);
}

/** motivo para el usuario, en castellano, a partir de un error de red */
export function describeError(error: unknown): string {
  if (error instanceof NasaServiceError) {
    if (error.kind === 'offline') return NO_DATA_REASONS.offline;
    if (error.kind === 'service' || (error.kind === 'http' && !error.retryable)) {
      return `El servicio de la NASA rechazó el pedido (${error.message}).`;
    }
  }
  return NO_DATA_REASONS.noResponse;
}

const oldest = (a: string | null, b: string) => (a === null || b < a ? b : a);
const lotKey = (lot: LotRef) => `${lot.id}@${geometryKey(lot.geometry)}`;

/** ventana mínima de subset que cubre todas las geometrías */
export function modisWindow(geometries: PolygonGeometry[]): ModisWindow {
  const box = bbox(geometries);
  const center: LatLng = [(box.minLat + box.maxLat) / 2, (box.minLng + box.maxLng) / 2];
  const half = halfExtentKm(box, center);
  return { center, kmNs: Math.max(1, windowKm(half.ns)), kmEw: Math.max(1, windowKm(half.ew)) };
}

/** agrupa lotes cercanos para que un solo subset cubra a cada grupo */
export function clusterLots(lots: LotRef[], maxHalfKm = CLUSTER_MAX_HALF_KM): LotRef[][] {
  const clusters: LotRef[][] = [];
  for (const lot of lots) {
    const fit = clusters.find((group) => {
      const box = bbox([...group, lot].map((l) => l.geometry));
      const center: LatLng = [(box.minLat + box.maxLat) / 2, (box.minLng + box.maxLng) / 2];
      const half = halfExtentKm(box, center);
      return Math.max(half.ns, half.ew) <= maxHalfKm;
    });
    if (fit) fit.push(lot);
    else clusters.push([lot]);
  }
  return clusters;
}

/** la tanda alineada de 10 compuestos que contiene un índice, cortada en el compuesto actual */
function alignedBatch(index: number, maxIndex: number): ModisDate[] {
  const lo = Math.floor(index / ORNL_MAX_DATES) * ORNL_MAX_DATES;
  const hi = Math.min(lo + ORNL_MAX_DATES - 1, maxIndex);
  const batch: ModisDate[] = [];
  for (let i = lo; i <= hi; i++) batch.push(compositeFromIndex('MOD13Q1', i));
  return batch;
}

/** el último compuesto con algún píxel válido para el lote; si no hay, el último que vino */
function latestFor(grids: NdviGrid[], geometry: PolygonGeometry): NdviObservation | null {
  const observations = grids.map((g) => observeLot(g, geometry));
  for (let i = observations.length - 1; i >= 0; i--) {
    if (observations[i].mean !== null) return observations[i];
  }
  return observations.at(-1) ?? null;
}

interface Entry {
  state: WritableSignal<LoadState<unknown>>;
  view: Signal<LoadState<unknown>>;
  run: () => Promise<void>;
  /** vuelve a dar STALLED_MS de espera antes de avisar que tarda */
  watch: () => void;
  ids: string[];
  running: boolean;
}

/**
 * datos abiertos de la NASA por lote, como señales con estado de carga
 * cada consulta se comparte entre pantallas: pedir dos veces lo mismo devuelve la misma señal
 */
@Service()
export class LotSatellite {
  private readonly clients = inject(NASA_CLIENTS);
  /** capas GIBS para Leaflet (tileUrl, availableDates) */
  readonly gibs = this.clients.gibs;
  private readonly entries = new Map<string, Entry>();

  /** clima y humedad de suelo diarios de NASA POWER en el centroide (origen ESTIMATED) */
  climate(lot: LotRef, sinceIso = '2020-01-01'): Signal<LoadState<ClimateDay[]>> {
    return this.shared(`climate:${sinceIso}:${lotKey(lot)}`, [lot], async (set) => {
      const point = centroid(lot.geometry);
      const today = this.today();
      const yearStart = `${today.slice(0, 4)}-01-01`;
      // lo de años cerrados va en un pedido aparte que no vence
      const parts: [string, string][] =
        sinceIso < yearStart
          ? [
              [sinceIso, `${Number(today.slice(0, 4)) - 1}-12-31`],
              [yearStart, today],
            ]
          : [[sinceIso, today]];
      const results = await Promise.allSettled(
        parts.map(([from, to]) => this.clients.power.daily(point, from, to)),
      );
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      const failed = results.find((r) => r.status === 'rejected');
      if (!ok.length) throw failed?.reason;
      set({
        status: failed ? 'partial' : 'ready',
        data: ok.flatMap((r) => r.data).sort((a, b) => a.date.localeCompare(b.date)),
        progress: 1,
        stale: ok.some((r) => r.stale),
        updatedAt: ok.map((r) => r.savedAt).sort()[0],
        error: failed ? describeError(failed.reason) : null,
      });
    });
  }

  /**
   * NDVI MODIS Terra del lote desde sinceIso, progresivo: primero los últimos 12 meses y después
   * hacia atrás, con status 'partial' y progress mientras llegan las tandas
   * los compuestos nublados o sin dato quedan con mean null para mostrar el hueco con su motivo
   */
  ndviHistory(lot: LotRef, sinceIso = '2020-01-01'): Signal<LoadState<NdviObservation[]>> {
    return this.shared(`ndvi:${sinceIso}:${lotKey(lot)}`, [lot], async (set, current) => {
      const window = modisWindow([lot.geometry]);
      const batches = compositeBatches('MOD13Q1', sinceIso, this.today());
      const yearAgo = this.daysAgo(365);
      const byDate = new Map((current()?.data ?? []).map((o) => [o.date, o]));
      let failed = 0;
      let inARow = 0;
      let stale = false;
      let updatedAt: string | null = null;
      let lastError: unknown = null;
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
          const recent = (batch.at(-1)?.calendarDate ?? '') >= yearAgo;
          const res = await this.clients.modis.ndviBatch(window, batch, {
            geometry: lot.geometry,
            priority: recent ? 'high' : 'low',
          });
          for (const grid of res.data) byDate.set(grid.date, observeLot(grid, lot.geometry));
          stale ||= res.stale;
          updatedAt = oldest(updatedAt, res.savedAt);
          inARow = 0;
        } catch (error) {
          failed++;
          inARow++;
          lastError = error;
        }
        const done = i + 1;
        const giveUp = inARow >= MAX_FAILED_IN_A_ROW && done < batches.length;
        const finished = done === batches.length || giveUp;
        const data = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
        const missing = failed + (giveUp ? batches.length - done : 0);
        set({
          status: finished
            ? missing === 0
              ? 'ready'
              : data.length
                ? 'partial'
                : 'error'
            : data.length
              ? 'partial'
              : 'loading',
          data: data.length ? data : null,
          // al rendirse se informa como terminado: el panel deja de mostrar "cargando" y muestra el error
          progress: finished ? 1 : done / batches.length,
          stale,
          updatedAt,
          error: missing
            ? `${describeError(lastError)} Faltan ${missing} de ${batches.length} tandas.`
            : null,
        });
        if (giveUp) return;
      }
    });
  }

  /**
   * grilla de píxeles de 250 m del lote: la del compuesto que contiene date o, sin date, la del
   * último compuesto con algún píxel válido sobre el lote
   */
  ndviGrid(lot: LotRef, date?: string): Signal<LoadState<NdviGrid>> {
    return this.shared(`grid:${date ?? 'latest'}:${lotKey(lot)}`, [lot], async (set) => {
      const window = modisWindow([lot.geometry]);
      const todayIndex = compositeIndexAt('MOD13Q1', this.today());
      const options = { geometry: lot.geometry };
      let grid: NdviGrid | null;
      let stale = false;
      let updatedAt: string | null = null;
      if (date) {
        const index = compositeIndexAt('MOD13Q1', date);
        const res = await this.clients.modis.ndviBatch(
          window,
          alignedBatch(index, todayIndex),
          options,
        );
        const wanted = compositeFromIndex('MOD13Q1', index).calendarDate;
        grid = res.data.find((g) => g.date === wanted) ?? null;
        stale = res.stale;
        updatedAt = res.savedAt;
      } else {
        const grids: NdviGrid[] = [];
        let index = todayIndex;
        // la tanda actual puede no tener compuestos publicados todavía: se mira la anterior
        for (let round = 0; round < 2; round++) {
          const batch = alignedBatch(index, todayIndex);
          const res = await this.clients.modis.ndviBatch(window, batch, options);
          grids.unshift(...res.data);
          stale ||= res.stale;
          updatedAt = oldest(updatedAt, res.savedAt);
          if (grids.some((g) => g.pixels.some((p) => p.inside && isValidPixel(p)))) break;
          index = batch[0].index - 1;
        }
        const withLot = grids.filter((g) => g.pixels.some((p) => p.inside && isValidPixel(p)));
        grid = withLot.at(-1) ?? grids.at(-1) ?? null;
      }
      set({
        status: grid ? 'ready' : 'error',
        data: grid,
        progress: 1,
        stale,
        updatedAt,
        error: grid ? null : NO_DATA_REASONS.notYet,
      });
    });
  }

  /**
   * último NDVI de cada lote (por id) con la menor cantidad de pedidos: un subset por grupo de
   * lotes cercanos; null si para ese lote no llegó nada
   */
  latestNdviForLots(lots: LotRef[]): Signal<LoadState<Record<string, NdviObservation | null>>> {
    const key = `latest:${lots.map(lotKey).sort().join('#')}`;
    return this.shared(key, lots, async (set) => {
      const todayIndex = compositeIndexAt('MOD13Q1', this.today());
      const clusters = clusterLots(lots);
      const result: Record<string, NdviObservation | null> = {};
      let done = 0;
      let failed = 0;
      let stale = false;
      let updatedAt: string | null = null;
      let lastError: unknown = null;
      await Promise.all(
        clusters.map(async (cluster) => {
          try {
            const window = modisWindow(cluster.map((l) => l.geometry));
            const grids: NdviGrid[] = [];
            let index = todayIndex;
            for (let round = 0; round < 2; round++) {
              const batch = alignedBatch(index, todayIndex);
              const res = await this.clients.modis.ndviBatch(window, batch);
              grids.unshift(...res.data);
              stale ||= res.stale;
              updatedAt = oldest(updatedAt, res.savedAt);
              const allSeen = cluster.every((l) => latestFor(grids, l.geometry)?.mean != null);
              if (allSeen) break;
              index = batch[0].index - 1;
            }
            for (const lot of cluster) result[String(lot.id)] = latestFor(grids, lot.geometry);
          } catch (error) {
            failed++;
            lastError = error;
            for (const lot of cluster) result[String(lot.id)] = null;
          }
          done++;
          const finished = done === clusters.length;
          const any = Object.values(result).some((o) => o !== null);
          set({
            status: finished ? (failed === 0 ? 'ready' : any ? 'partial' : 'error') : 'partial',
            data: { ...result },
            progress: done / clusters.length,
            stale,
            updatedAt,
            error: failed ? describeError(lastError) : null,
          });
        }),
      );
      if (!clusters.length) {
        set({ status: 'ready', data: {}, progress: 1, stale: false, updatedAt: null, error: null });
      }
    });
  }

  /** pasadas NISAR (todas) y escenas HLS de los últimos 120 días que cruzan el lote */
  scenes(lot: LotRef): Signal<LoadState<SceneList>> {
    return this.shared(`scenes:${lotKey(lot)}`, [lot], async (set) => {
      const results = await Promise.allSettled([
        this.clients.scenes.nisarScenes(lot.geometry),
        this.clients.scenes.hlsScenes(lot.geometry, this.daysAgo(HLS_LOOKBACK_DAYS), this.today()),
      ]);
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      const failed = results.find((r) => r.status === 'rejected');
      if (!ok.length) throw failed?.reason;
      const incomplete = !!failed || ok.some((r) => r.incomplete);
      set({
        status: incomplete ? 'partial' : 'ready',
        data: {
          items: ok.flatMap((r) => r.data.items).sort((a, b) => b.start.localeCompare(a.start)),
          total: ok.reduce((s, r) => s + r.data.total, 0),
        },
        progress: 1,
        stale: ok.some((r) => r.stale),
        updatedAt: ok.map((r) => r.savedAt).sort()[0],
        error: incomplete ? describeError(failed?.reason) : null,
      });
    });
  }

  /** cobertura del suelo IGBP anual desde 2020 en el centroide (MCD12Q1, 500 m) */
  landCover(lot: LotRef, fromYear = 2020): Signal<LoadState<LandCoverYear[]>> {
    return this.shared(`landcover:${fromYear}:${lotKey(lot)}`, [lot], async (set) => {
      const res = await this.clients.modis.landCover(centroid(lot.geometry), fromYear);
      set({
        status: 'ready',
        data: res.data,
        progress: 1,
        stale: res.stale,
        updatedAt: res.savedAt,
        error: null,
      });
    });
  }

  /**
   * uso del suelo desde fromYear según MODIS (MCD12Q1, píxeles de unos 460 m): la clase de cada
   * píxel que cubre el lote, año por año, y si el uso se mantuvo (el dominante y el de cada píxel,
   * ver landUseEvidence). es orientativo, y un veredicto no_data igual llega como 'ready' con su
   * motivo en data.reason
   */
  landUse(lot: LotRef, fromYear = LAND_USE_BASELINE_YEAR): Signal<LoadState<LandUseEvidence>> {
    return this.shared(`landuse:${fromYear}:${lotKey(lot)}`, [lot], async (set) => {
      const window = landCoverWindow(lot.geometry);
      const res = await this.clients.modis.landCoverGrid?.(window, fromYear);
      if (!res) throw new Error('el cliente de MODIS no lee la grilla de cobertura');
      set({
        status: 'ready',
        data: lotLandUse(res.data, lot.geometry, {
          baselineYear: fromYear,
          retrievedAt: res.savedAt,
          clipped: window.clipped,
        }),
        progress: 1,
        stale: res.stale,
        updatedAt: res.savedAt,
        error: null,
      });
    });
  }

  /** rangos de fechas publicadas de una capa GIBS, como señal (copia de 6 h) */
  layerDates(layerId: string): Signal<LoadState<DateRange[]>> {
    return this.shared(`gibs:${layerId}`, [], async (set) => {
      const res = await this.clients.gibs.availableDates(layerId);
      set({
        status: 'ready',
        data: res.data,
        progress: 1,
        stale: res.stale,
        updatedAt: res.savedAt,
        error: null,
      });
    });
  }

  /**
   * vuelve a pedir lo que falló o quedó incompleto (de un lote, o de todos). lo que se dejó de
   * esperar porque tardaba y sigue en vuelo no se pide de nuevo: vuelve a "cargando" y se espera
   */
  retry(lot?: LotRef): void {
    for (const entry of this.entries.values()) {
      const state = entry.state();
      if (state.status === 'ready' && !state.stale) continue;
      if (lot && !entry.ids.includes(String(lot.id))) continue;
      if (entry.running) {
        if (!isPending(state)) {
          entry.state.set(loadingState(state.data));
          entry.watch();
        }
        continue;
      }
      entry.state.set(loadingState(state.data));
      void entry.run();
    }
  }

  private shared<T>(
    key: string,
    lots: LotRef[],
    load: (set: (state: LoadState<T>) => void, current: () => LoadState<T>) => Promise<void>,
  ): Signal<LoadState<T>> {
    const existing = this.entries.get(key);
    if (existing) return existing.view as Signal<LoadState<T>>;
    const state = signal<LoadState<unknown>>(loadingState());
    const typed = state as unknown as WritableSignal<LoadState<T>>;
    let stalled: ReturnType<typeof setTimeout> | undefined;
    // si en STALLED_MS no llega nada nuevo se avisa que tarda; lo que llegue después igual se muestra
    const watch = () => {
      clearTimeout(stalled);
      stalled = setTimeout(() => {
        state.update((s) =>
          isPending(s)
            ? {
                ...s,
                status: s.data === null ? 'error' : 'partial',
                progress: 1,
                error: NO_DATA_REASONS.slow,
              }
            : s,
        );
      }, STALLED_MS);
    };
    const run = async () => {
      entry.running = true;
      watch();
      try {
        await load(
          (s) => {
            typed.set(s);
            if (isPending(s)) watch();
          },
          () => typed(),
        );
      } catch (error) {
        typed.update((s) => ({
          ...s,
          status: s.data === null ? 'error' : 'partial',
          progress: 1,
          error: describeError(error),
        }));
      } finally {
        entry.running = false;
        clearTimeout(stalled);
      }
    };
    const entry: Entry = {
      state,
      view: state.asReadonly(),
      run,
      watch,
      ids: lots.map((l) => String(l.id)),
      running: true,
    };
    this.entries.set(key, entry);
    // arranca en otra vuelta: así nunca escribe una señal mientras se evalúa un computed
    void Promise.resolve().then(run);
    return entry.view as Signal<LoadState<T>>;
  }

  private today(): string {
    return new Date(this.clients.now()).toISOString().slice(0, 10);
  }

  private daysAgo(days: number): string {
    return new Date(this.clients.now() - days * DAY_MS).toISOString().slice(0, 10);
  }
}
