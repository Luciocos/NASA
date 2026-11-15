import type { PolygonGeometry } from '../models';
import {
  LANDCOVER_LOT3_FIXTURE,
  LOT3,
  NDVI_LOT3_FIXTURE,
  NDVI_RIVER_FIXTURE,
  RELIABILITY_LOT3_FIXTURE,
} from './fixtures';
import { centroid, cmrPolygon, pointInPolygon, sinusoidalToLatLng } from './geo';
import type { NasaHttp, NasaRequest } from './http';
import {
  ModisClient,
  type OrnlSubset,
  batchDates,
  compositeBatches,
  compositeFromIndex,
  compositeIndexAt,
  parseNdviSubset,
  windowKm,
} from './modis';

function fakeHttp(bodies: (req: NasaRequest) => unknown) {
  const calls: NasaRequest[] = [];
  const http = {
    get: (req: NasaRequest) => {
      calls.push(req);
      return Promise.resolve({
        body: bodies(req),
        meta: {},
        savedAt: '2026-11-14T12:00:00.000Z',
        stale: false,
        fromCache: false,
      });
    },
  } as unknown as NasaHttp;
  return { http, calls };
}

const NOW = Date.parse('2026-11-14T12:00:00Z');

describe('geometría', () => {
  it('respeta los huecos y calcula el centroide', () => {
    const square: PolygonGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1],
        ],
      ],
    };
    expect(pointInPolygon([0.5, 0.5], square)).toBe(true);
    expect(pointInPolygon([2, 2], square)).toBe(false);
    expect(pointInPolygon([5, 5], square)).toBe(false);
    expect(centroid(square)).toEqual([2, 2]);
  });

  it('arma el polígono de CMR cerrado y antihorario', () => {
    const points = cmrPolygon(LOT3).split(',').map(Number);
    expect(points.slice(0, 2)).toEqual(points.slice(-2));
    // el lote viene horario: se invierte
    expect(points.slice(2, 4)).toEqual([-61.189497, -33.09009]);
  });
});

describe('calendario MODIS', () => {
  it('convierte índices y fechas de Terra y Aqua', () => {
    const terra = compositeIndexAt('MOD13Q1', '2026-10-20');
    expect(compositeFromIndex('MOD13Q1', terra)).toMatchObject({
      modisDate: 'A2026289',
      calendarDate: '2026-10-16',
    });
    expect(compositeFromIndex('MYD13Q1', compositeIndexAt('MYD13Q1', '2026-10-08')).modisDate).toBe(
      'A2026281',
    );
    // antes del día 9 el compuesto de Aqua es el último del año anterior
    expect(compositeFromIndex('MYD13Q1', compositeIndexAt('MYD13Q1', '2026-01-05')).modisDate).toBe(
      'A2025361',
    );
    // en año bisiesto la fecha corre un día pero el día del año es el mismo
    expect(compositeFromIndex('MOD13Q1', compositeIndexAt('MOD13Q1', '2024-10-15'))).toMatchObject({
      modisDate: 'A2024289',
      calendarDate: '2024-10-15',
    });
  });

  it('parte el rango en tandas alineadas de a lo sumo 10, de la más nueva a la más vieja', () => {
    const batches = compositeBatches('MOD13Q1', '2020-01-01', '2026-11-14');
    const all = batches.flat();
    expect(all).toHaveLength(6 * 23 + 20);
    expect(batches.every((b) => b.length <= 10 && b.at(-1)!.index - b[0].index < 10)).toBe(true);
    expect(batches[0].at(-1)?.modisDate).toBe('A2026305');
    expect(batches.at(-1)?.[0].modisDate).toBe('A2020001');
    // la tanda vieja queda igual aunque pase el tiempo: su copia no se invalida
    const later = compositeBatches('MOD13Q1', '2020-01-01', '2027-03-01');
    expect(later.at(-1)).toEqual(batches.at(-1));
    expect(batchDates('MOD13Q1', ['A2026289', 'A2020001', 'A2026273'])).toHaveLength(2);
  });

  it('elige la ventana mínima en km que cubre el lote con la grilla de 250 m', () => {
    expect(windowKm(0)).toBe(0);
    expect(windowKm(0.9)).toBe(1);
    expect(windowKm(0.95)).toBe(2);
  });
});

describe('subsets MODIS', () => {
  it('arma la grilla del lote 3 con NDVI escalado y confiabilidad', () => {
    const grids = parseNdviSubset(
      NDVI_LOT3_FIXTURE as OrnlSubset,
      RELIABILITY_LOT3_FIXTURE as OrnlSubset,
      'MOD13Q1',
      LOT3,
    );
    expect(grids.map((g) => g.date)).toEqual(['2026-09-30', '2026-10-16']);
    const [first, second] = grids;
    expect(first.pixels).toHaveLength(81);
    expect(first.pixels[0].value).toBe(0.4459);
    expect(first.pixels[0].reliability).toBe(3);
    expect(second.pixels.filter((p) => p.inside).length).toBeGreaterThan(10);
    expect(first.cellSizeM).toBeCloseTo(231.66, 1);
  });

  it('las filas van de norte a sur y las columnas de oeste a este (río Paraná, Rosario)', () => {
    // verificado con un caso real: frente a Rosario el agua del Paraná baja hacia el sudeste,
    // la ciudad queda al sudoeste y las islas de Entre Ríos al noreste. con filas o columnas al
    // revés, el cuadrante noreste no tendría vegetación
    const [grid] = parseNdviSubset(NDVI_RIVER_FIXTURE as OrnlSubset, null, 'MOD13Q1');
    const quadrant = (north: boolean, east: boolean) => {
      const values = grid.pixels
        .filter((p) => p.value !== null)
        .filter((p) => p.center[0] > -32.95 === north && p.center[1] > -60.62 === east)
        .map((p) => p.value as number);
      return values.reduce((s, v) => s + v, 0) / values.length;
    };
    expect(quadrant(true, true)).toBeGreaterThan(0.35);
    expect(quadrant(false, true)).toBeLessThan(0.1);
    expect(quadrant(false, false)).toBeGreaterThan(0.1);
    expect(quadrant(false, false)).toBeLessThan(0.3);
    // y la ventana queda centrada en el punto pedido (a menos de un píxel)
    const { xllcorner, yllcorner, cellsize, nrows } = NDVI_RIVER_FIXTURE;
    const half = (nrows * cellsize) / 2;
    const [lat, lng] = sinusoidalToLatLng(Number(xllcorner) + half, Number(yllcorner) + half);
    expect(Math.abs(lat + 32.95) * 111_195).toBeLessThan(cellsize);
    expect(Math.abs(lng + 60.62) * 111_195 * Math.cos((lat * Math.PI) / 180)).toBeLessThan(
      cellsize,
    );
  });

  it('pide NDVI y confiabilidad por tanda, y nunca más de 10 fechas', async () => {
    const { http, calls } = fakeHttp((req) =>
      req.url.includes('reliability') ? RELIABILITY_LOT3_FIXTURE : NDVI_LOT3_FIXTURE,
    );
    const modis = new ModisClient(http, () => NOW);
    const batch = [
      compositeFromIndex('MOD13Q1', 2026 * 23 + 17),
      compositeFromIndex('MOD13Q1', 2026 * 23 + 18),
    ];
    const res = await modis.ndviBatch({ center: centroid(LOT3), kmNs: 1, kmEw: 1 }, batch);
    expect(res.data).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain(
      'startDate=A2026273&endDate=A2026289&kmAboveBelow=1&kmLeftRight=1',
    );
    expect(calls[0].headers).toEqual({ Accept: 'application/json' });
    // lo reciente todavía puede reprocesarse: vence
    expect(calls[0].maxAgeMs).toBeLessThan(Infinity);
    const tooMany = Array.from({ length: 11 }, (_, i) => compositeFromIndex('MOD13Q1', 46460 + i));
    await expect(modis.ndviBatch({ center: [0, 0], kmNs: 0, kmEw: 0 }, tooMany)).rejects.toThrow();
  });

  it('lo histórico cerrado no vence', async () => {
    const { http, calls } = fakeHttp(() => ({ ...NDVI_LOT3_FIXTURE, subset: [] }));
    const modis = new ModisClient(http, () => NOW);
    await modis.ndviBatch({ center: [0, 0], kmNs: 1, kmEw: 1 }, [
      compositeFromIndex('MOD13Q1', 46460),
    ]);
    expect(calls[0].maxAgeMs).toBe(Infinity);
  });

  it('lee la cobertura IGBP anual', async () => {
    const { http, calls } = fakeHttp(() => LANDCOVER_LOT3_FIXTURE);
    const res = await new ModisClient(http, () => NOW).landCover(centroid(LOT3));
    expect(calls[0].url).toContain('MCD12Q1/subset');
    expect(calls[0].url).toContain('startDate=A2020001&endDate=A2026001');
    expect(res.data).toHaveLength(6);
    expect(res.data[0]).toEqual({ year: 2020, classId: 12, label: 'Cultivo agrícola' });
  });
});
