import { TestBed } from '@angular/core/testing';

import type { PolygonGeometry } from '../models';
import type { NasaClients } from './clients';
import { LOT3 } from './fixtures';
import { GibsCatalog } from './gibs';
import type { NasaHttp } from './http';
import { LotSatellite, NASA_CLIENTS, clusterLots, modisWindow } from './lot-satellite';
import type { LatLng, LotRef, NdviGrid, NdviPixel } from './models';
import type { ModisDate, ModisWindow } from './modis';
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
      pixels.push({
        ring: [center],
        center,
        value,
        reliability: rel,
        inside: geometry ? pointInPolygon(center, geometry) : false,
      });
    }
  }
  return { date, satellite: 'Terra', cellSizeM: 231.66, pixels };
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
    expect(history()).toMatchObject({ status: 'partial', progress: 4 / 16 });
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
});
