import { TestBed } from '@angular/core/testing';

import type { PolygonGeometry } from '../models';
import { NasaCache } from './cache';
import { type NasaClients, createNasaClients } from './clients';
import { LOT3, ornlGrid } from './fixtures';
import { GibsCatalog } from './gibs';
import { type NasaHttp, NasaServiceError } from './http';
import { LotSatellite, NASA_CLIENTS, STALLED_MS, clusterLots, modisWindow } from './lot-satellite';
import { NO_DATA_REASONS } from './sources';
import type { LatLng, LotRef, NdviGrid, NdviPixel } from './models';
import { type LandCoverGrid, type ModisDate, type ModisWindow, landCoverWindow } from './modis';
import { pointInPolygon } from './geo';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const SAVED = '2026-11-14T12:00:00.000Z';

/** lotes reales de Casilda y uno lejano (Córdoba) */
const square = ([lat, lng]: LatLng, d = 0.004): PolygonGeometry => ({
  type: 'Polygon',
  coordinates: [
    [
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ],
  ],
});
const LOTS: LotRef[] = [
  { id: 3, geometry: LOT3 },
  { id: 1, geometry: square([-33.0433, -61.2128]) },
  { id: 4, geometry: square([-33.0808, -61.2207]) },
  { id: 'far', geometry: square([-31.4, -64.18]) },
];

/** grilla falsa: píxeles cada 0,002° alrededor del centro de la ventana */
function fakeGrid(
  window: ModisWindow,
  date: string,
  value: number | null,
  rel = 0,
  geometry?: PolygonGeometry,
): NdviGrid {
  const pixels: NdviPixel[] = [];
  const [lat0, lng0] = window.center;
  for (let i = -15; i <= 15; i++) {
    for (let j = -15; j <= 15; j++) {
      const center: LatLng = [lat0 + i * 0.002, lng0 + j * 0.002];
      const h = 0.001;
      pixels.push({
        ring: [
          [center[0] + h, center[1] - h],
          [center[0] + h, center[1] + h],
          [center[0] - h, center[1] + h],
          [center[0] - h, center[1] - h],
        ],
        center,
        value,
        reliability: rel,
        inside: geometry ? pointInPolygon(center, geometry) : false,
      });
    }
  }
  return { date, satellite: 'Terra', cellSizeM: 231.66, pixels };
}

/** cobertura falsa de 2020 a 2025 sobre la grilla que armaría ORNL para la ventana */
function fakeLandCover(window: ModisWindow, classOf: (year: number) => number): LandCoverGrid {
  const grid = ornlGrid(window);
  return {
    ...grid,
    years: [2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({
      year,
      classes: Array.from({ length: grid.nrows * grid.ncols }, () => classOf(year)),
    })),
  };
}

type BatchFn = (
  window: ModisWindow,
  batch: ModisDate[],
  options?: { geometry?: PolygonGeometry },
) => NdviGrid[];

function setup(batchFn: BatchFn, extra: Partial<NasaClients> = {}) {
  const calls: { window: ModisWindow; batch: ModisDate[]; priority?: string }[] = [];
  const clients: NasaClients = {
    now: () => NOW,
    gibs: new GibsCatalog({} as NasaHttp),
    power: {
      daily: vi.fn(async (_p: LatLng, from: string, to: string) => ({
        data: [
          { date: from, rainMm: 1, tMaxC: 20, tMinC: 10, soilTop: 0.3, soilRoot: 0.4 },
          { date: to, rainMm: null, tMaxC: null, tMinC: null, soilTop: null, soilRoot: null },
        ],
        stale: false,
        savedAt: SAVED,
      })),
    },
    modis: {
      ndviBatch: vi.fn(
        async (
          window: ModisWindow,
          batch: ModisDate[],
          options: { geometry?: PolygonGeometry; priority?: 'high' | 'low' } = {},
        ) => {
          calls.push({ window, batch, priority: options.priority });
          // una vuelta del bucle de eventos por tanda, para ver el avance
          await new Promise((resolve) => setTimeout(resolve, 0));
          return { data: batchFn(window, batch, options), stale: false, savedAt: SAVED };
        },
      ),
      landCover: vi.fn(async () => ({
        data: [{ year: 2020, classId: 12, label: 'Cultivo agrícola' }],
        stale: true,
        savedAt: SAVED,
      })),
      landCoverGrid: vi.fn(async (window: ModisWindow) => ({
        data: fakeLandCover(window, () => 12),
        stale: false,
        savedAt: SAVED,
      })),
    },
    scenes: {
      nisarScenes: vi.fn(async () => ({
        data: { items: [], total: 20 },
        stale: false,
        savedAt: SAVED,
        incomplete: false,
      })),
      hlsScenes: vi.fn(async () => {
        throw new Error('sin respuesta');
      }),
    },
    ...extra,
  };
  TestBed.configureTestingModule({ providers: [{ provide: NASA_CLIENTS, useValue: clients }] });
  return { sat: TestBed.inject(LotSatellite), clients, calls };
}

const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

// las tandas publicadas: hasta el compuesto del 16/10 (los de noviembre todavía no salieron)
const published = (batch: ModisDate[]) => batch.filter((d) => d.calendarDate <= '2026-10-16');

describe('LotSatellite', () => {
  it('comparte la señal por lote y no repite pedidos', async () => {
    const { sat, clients } = setup(() => []);
    const lot = { id: 3, geometry: LOT3 };
    expect(sat.climate(lot)).toBe(sat.climate({ ...lot }));
    await settle();
    // años cerrados en un pedido y el año en curso en otro
    expect(clients.power.daily).toHaveBeenCalledTimes(2);
    const state = sat.climate(lot)();
    expect(state).toMatchObject({ status: 'ready', progress: 1, updatedAt: SAVED });
    expect(state.data?.map((d) => d.date)).toEqual([
      '2020-01-01',
      '2025-12-31',
      '2026-01-01',
      '2026-11-14',
    ]);
  });

  it('trae el historial NDVI de lo nuevo a lo viejo, avisando el avance', async () => {
    const { sat, calls } = setup((w, batch, o) =>
      published(batch).map((d) =>
        fakeGrid(
          w,
          d.calendarDate,
          d.calendarDate === '2026-10-16' ? null : 0.6,
          d.calendarDate === '2026-10-16' ? 3 : 0,
          o?.geometry,
        ),
      ),
    );
    const history = sat.ndviHistory({ id: 3, geometry: LOT3 });
    expect(history().status).toBe('loading');
    const seen: string[] = [];
    for (let i = 0; i < 40 && history().status !== 'ready'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      seen.push(history().status);
    }
    expect(seen).toContain('partial');
    const state = history();
    expect(state).toMatchObject({ status: 'ready', progress: 1, error: null });
    expect(calls[0].batch.at(-1)?.modisDate).toBe('A2026305');
    expect(calls[0].priority).toBe('high');
    expect(calls.at(-1)?.priority).toBe('low');
    expect(calls.at(-1)?.batch[0].modisDate).toBe('A2020001');
    const last = state.data?.at(-1);
    // el compuesto nublado queda con mean null y su motivo
    expect(last).toMatchObject({ date: '2026-10-16', mean: null, quality: 'cloudy' });
    expect(state.data?.at(-2)?.mean).toBe(0.6);
    expect(state.data).toHaveLength(6 * 23 + 19);
  });

  it('deja de insistir tras dos tandas seguidas sin respuesta', async () => {
    const { sat, calls } = setup((w, batch) => {
      if (batch[0].calendarDate < '2026-01-01') throw new Error('502');
      return published(batch).map((d) => fakeGrid(w, d.calendarDate, 0.5));
    });
    const history = sat.ndviHistory({ id: 3, geometry: LOT3 });
    await settle();
    expect(calls).toHaveLength(4);
    // al rendirse queda como terminada (progress 1) para que la pantalla muestre el error
    expect(history()).toMatchObject({ status: 'partial', progress: 1 });
    expect(history().error).toContain('Faltan 14 de 16 tandas');
    // retry retoma: vuelve a pedir y conserva lo que ya había llegado mientras tanto
    sat.retry({ id: 3, geometry: LOT3 });
    expect(history().status).toBe('loading');
    expect(history().data?.length).toBeGreaterThan(0);
    await settle();
    expect(calls).toHaveLength(8);
  });

  it('resuelve el último NDVI de los lotes cercanos con un solo pedido', async () => {
    const { sat, calls } = setup((w, batch) =>
      published(batch).map((d) => fakeGrid(w, d.calendarDate, 0.42)),
    );
    const latest = sat.latestNdviForLots(LOTS);
    await settle();
    expect(clusterLots(LOTS)).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(latest()).toMatchObject({ status: 'ready', progress: 1 });
    const data = latest().data ?? {};
    expect(Object.keys(data).sort()).toEqual(['1', '3', '4', 'far']);
    expect(data['3']).toMatchObject({ date: '2026-10-16', mean: 0.42, centroidOnly: false });
  });

  it('la grilla busca en la tanda anterior si la actual no tiene compuestos publicados', async () => {
    const { sat, calls } = setup((w, batch, o) =>
      batch
        .filter((d) => d.calendarDate <= '2026-07-11')
        .map((d) => fakeGrid(w, d.calendarDate, 0.5, 0, o?.geometry)),
    );
    const grid = sat.ndviGrid({ id: 3, geometry: LOT3 });
    await settle();
    expect(calls).toHaveLength(2);
    expect(grid()).toMatchObject({ status: 'ready', data: { date: '2026-06-26' } });
    const window = modisWindow([LOT3]);
    expect([window.kmNs, window.kmEw]).toEqual([1, 1]);
  });

  it('marca parcial lo que llegó incompleto y retry vuelve a pedir', async () => {
    const { sat, clients } = setup(() => []);
    const lot = { id: 3, geometry: LOT3 };
    const scenes = sat.scenes(lot);
    const cover = sat.landCover(lot);
    await settle();
    expect(scenes()).toMatchObject({ status: 'partial', data: { total: 20 } });
    expect(scenes().error).toContain('Sin respuesta');
    expect(cover()).toMatchObject({ status: 'ready', stale: true });
    sat.retry(lot);
    await settle();
    expect(clients.scenes.nisarScenes).toHaveBeenCalledTimes(2);
    expect(clients.modis.landCover).toHaveBeenCalledTimes(2);
  });
  it('arma el uso del suelo con los píxeles del lote y comparte la señal', async () => {
    const { sat, clients } = setup(() => []);
    const lot = { id: 3, geometry: LOT3 };
    const landUse = sat.landUse(lot);
    expect(sat.landUse({ ...lot })).toBe(landUse);
    expect(landUse().status).toBe('loading');
    await settle();
    expect(clients.modis.landCoverGrid).toHaveBeenCalledTimes(1);
    expect(clients.modis.landCoverGrid).toHaveBeenCalledWith(landCoverWindow(LOT3), 2020);
    expect(landUse()).toMatchObject({
      status: 'ready',
      progress: 1,
      stale: false,
      updatedAt: SAVED,
      error: null,
    });
    expect(landUse().data).toMatchObject({
      verdict: 'unchanged',
      baselineYear: 2020,
      lastYear: 2025,
      pixelCount: 4,
      centroidFallback: false,
      origin: 'VERIFIED',
      source: { retrievedAt: SAVED },
    });
    expect(landUse().data?.years).toHaveLength(6);
  });

  it('el uso del suelo marca un posible cambio, y si falla lo dice y retry vuelve a pedir', async () => {
    let attempts = 0;
    const landCoverGrid = vi.fn(async (window: ModisWindow) => {
      attempts++;
      if (attempts === 1) throw new NasaServiceError('HTTP 502', 'http', true, 502);
      // armado para la prueba: pastizal en 2020 y cultivo después
      return {
        data: fakeLandCover(window, (year) => (year === 2020 ? 10 : 12)),
        stale: true,
        savedAt: SAVED,
      };
    });
    const { sat } = setup(() => [], {
      modis: { ndviBatch: vi.fn(), landCover: vi.fn(), landCoverGrid },
    });
    const lot = { id: 3, geometry: LOT3 };
    const landUse = sat.landUse(lot);
    await settle();
    expect(landUse()).toMatchObject({ status: 'error', data: null, progress: 1 });
    expect(landUse().error).toContain('Sin respuesta');
    sat.retry(lot);
    await settle();
    expect(landCoverGrid).toHaveBeenCalledTimes(2);
    expect(landUse()).toMatchObject({ status: 'ready', stale: true, error: null });
    expect(landUse().data?.verdict).toBe('possible_change');
    expect(landUse().data?.reason).toContain('En 2020 MODIS vio vegetación natural (pastizal)');
  });

  it('sin el cliente de la grilla, el uso del suelo queda en error con su motivo', async () => {
    const { sat } = setup(() => [], { modis: { ndviBatch: vi.fn(), landCover: vi.fn() } });
    const landUse = sat.landUse({ id: 3, geometry: LOT3 });
    await settle();
    expect(landUse()).toMatchObject({ status: 'error', data: null });
    expect(landUse().error).toBeTruthy();
  });
});

/** respuesta de LC_Type1 con la grilla que armaría ORNL para la ventana, toda cultivo */
function landCoverBody(window: ModisWindow) {
  const grid = ornlGrid(window);
  return {
    xllcorner: String(grid.xll),
    yllcorner: String(grid.yll),
    cellsize: grid.cellSizeM,
    nrows: grid.nrows,
    ncols: grid.ncols,
    subset: [2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({
      modis_date: `A${year}001`,
      calendar_date: `${year}-01-01`,
      band: 'LC_Type1',
      data: Array.from({ length: grid.nrows * grid.ncols }, () => 12),
    })),
  };
}

/**
 * fetch falso con reloj: cada pedido consume un paso del plan y llega con su cuerpo, o se corta
 * sin respuesta (como el net::ERR_FAILED de ORNL a los 71 s), a los ms indicados
 */
function timedFetch(plan: { afterMs: number; body?: unknown }[]) {
  const urls: string[] = [];
  const fn = ((input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    const step = plan.shift() ?? { afterMs: 71_000 };
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (step.body === undefined) reject(new TypeError('Failed to fetch'));
        else resolve(new Response(JSON.stringify(step.body), { status: 200 }));
      }, step.afterMs);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('abort', 'AbortError'));
      });
    });
  }) as typeof fetch;
  return { fn, urls };
}

describe('LotSatellite con ORNL lento o caído (clientes reales, reloj falso)', () => {
  const lot = { id: 3, geometry: LOT3 };
  const body = landCoverBody(landCoverWindow(LOT3));

  function realSetup(plan: { afterMs: number; body?: unknown }[]) {
    vi.useFakeTimers();
    const fetch = timedFetch(plan);
    const clients = createNasaClients({
      fetch: fetch.fn,
      cache: new NasaCache(null),
      now: () => NOW,
      isOnline: () => true,
    });
    TestBed.configureTestingModule({ providers: [{ provide: NASA_CLIENTS, useValue: clients }] });
    return { sat: TestBed.inject(LotSatellite), urls: fetch.urls };
  }

  afterEach(() => vi.useRealTimers());

  it('una respuesta lenta que llega no se corta ni pasa por error', async () => {
    const { sat, urls } = realSetup([{ afterMs: 70_000, body }]);
    const landUse = sat.landUse(lot);
    await vi.advanceTimersByTimeAsync(69_900);
    expect(landUse().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(200);
    expect(landUse()).toMatchObject({ status: 'ready', error: null });
    expect(landUse().data?.verdict).toBe('unchanged');
    expect(urls).toHaveLength(1);
  });

  it('si ORNL corta cada intento, a los 150 s deja de mostrar cargando y se puede reintentar', async () => {
    expect(STALLED_MS).toBe(150_000);
    const { sat, urls } = realSetup([]);
    const landUse = sat.landUse(lot);
    // dos intentos de 71 s con su espera: todavía puede llegar
    await vi.advanceTimersByTimeAsync(149_000);
    expect(landUse().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(landUse()).toMatchObject({
      status: 'error',
      data: null,
      progress: 1,
      error: NO_DATA_REASONS.slow,
    });
    // el tercer intento sigue en vuelo: reintentar no repite el pedido, vuelve a esperarlo
    expect(urls).toHaveLength(3);
    sat.retry(lot);
    expect(landUse().status).toBe('loading');
    expect(urls).toHaveLength(3);
    // al cortarse el último intento queda el motivo de siempre
    await vi.advanceTimersByTimeAsync(71_000);
    expect(landUse()).toMatchObject({ status: 'error', error: NO_DATA_REASONS.noResponse });
    // y ahora sí reintentar vuelve a pedir
    sat.retry(lot);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(urls).toHaveLength(4);
  });

  it('si después del aviso el pedido llega, se muestra solo', async () => {
    const { sat } = realSetup([{ afterMs: 71_000 }, { afterMs: 71_000 }, { afterMs: 5_000, body }]);
    const landUse = sat.landUse(lot);
    await vi.advanceTimersByTimeAsync(151_000);
    expect(landUse()).toMatchObject({ status: 'error', error: NO_DATA_REASONS.slow });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(landUse()).toMatchObject({ status: 'ready', error: null, progress: 1 });
    expect(landUse().data?.verdict).toBe('unchanged');
  });

  it('sin conexión usa la copia guardada del uso del suelo y la marca como vieja', async () => {
    vi.useFakeTimers();
    const cache = new NasaCache(null);
    let now = NOW;
    // cada apertura es una sesión nueva de la app sobre la misma copia guardada
    const open = (online: boolean, fetchFn: typeof fetch) => {
      TestBed.resetTestingModule();
      const clients = createNasaClients({
        fetch: fetchFn,
        cache,
        now: () => now,
        isOnline: () => online,
      });
      TestBed.configureTestingModule({ providers: [{ provide: NASA_CLIENTS, useValue: clients }] });
      return TestBed.inject(LotSatellite);
    };
    const first = open(true, timedFetch([{ afterMs: 1_000, body }]).fn).landUse(lot);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(first()).toMatchObject({ status: 'ready', stale: false, updatedAt: SAVED });
    // ocho días después (la copia vence a los siete) y sin red: la copia vencida vale más que nada
    now += 8 * 86_400_000;
    const offlineFetch = timedFetch([]);
    const offline = open(false, offlineFetch.fn).landUse(lot);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(offlineFetch.urls).toHaveLength(0);
    expect(offline()).toMatchObject({ status: 'ready', stale: true, updatedAt: SAVED });
    expect(offline().data).toMatchObject({ verdict: 'unchanged', source: { retrievedAt: SAVED } });
    // sin copia y sin red: el motivo de siempre, sin quedar cargando
    const far = open(false, offlineFetch.fn).landUse({ id: 9, geometry: square([-31.4, -64.18]) });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(far()).toMatchObject({ status: 'error', error: NO_DATA_REASONS.offline });
  });

  it('una carga por tandas que se traba deja de mostrarse como pendiente', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const { sat } = setup(() => [], {
      modis: {
        // la primera tanda llega y la segunda no termina nunca
        ndviBatch: vi.fn(async () => {
          if (calls++ === 0) return { data: [], stale: false, savedAt: SAVED };
          return new Promise<never>(() => undefined);
        }),
        landCover: vi.fn(),
      },
    });
    const history = sat.ndviHistory(lot);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(history()).toMatchObject({ status: 'loading' });
    expect(history().progress).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(STALLED_MS);
    expect(history()).toMatchObject({ status: 'error', progress: 1, error: NO_DATA_REASONS.slow });
  });
});
