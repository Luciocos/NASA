import { CMR_FIXTURE, GIBS_S30_DOMAIN_FIXTURE, LOT3, POWER_FIXTURE } from './fixtures';
import { GibsCatalog, bestHlsScene, hlsLayerFor, nearestAvailable, parseGibsDomain } from './gibs';
import type { NasaHttp, NasaRequest } from './http';
import type { ClimateDay } from './models';
import {
  PowerClient,
  type PowerResponse,
  lastDaysRain,
  latestSoilWetness,
  monthlyRain,
  parsePowerDaily,
} from './power';
import { SceneCatalog } from './scenes';

const NOW = Date.parse('2026-11-14T12:00:00Z');

function fakeHttp(answer: (req: NasaRequest) => { body: unknown; meta?: Record<string, string> }) {
  const calls: NasaRequest[] = [];
  const http = {
    get: async (req: NasaRequest) => {
      calls.push(req);
      const { body, meta = {} } = answer(req);
      return { body, meta, savedAt: '2026-11-14T12:00:00.000Z', stale: false, fromCache: false };
    },
  } as unknown as NasaHttp;
  return { http, calls };
}

const day = (date: string, rainMm: number | null, soil: number | null = null): ClimateDay => ({
  date,
  rainMm,
  tMaxC: null,
  tMinC: null,
  soilTop: soil,
  soilRoot: soil,
});

describe('NASA POWER', () => {
  it('pasa -999 a null y ordena los días', () => {
    const days = parsePowerDaily(POWER_FIXTURE as PowerResponse);
    expect(days).toHaveLength(10);
    expect(days[0]).toEqual({
      date: '2026-11-05',
      rainMm: 0,
      tMaxC: 29.83,
      tMinC: expect.any(Number),
      soilTop: expect.any(Number),
      soilRoot: expect.any(Number),
    });
    expect(days.at(-1)).toMatchObject({ date: '2026-11-14', rainMm: null, soilTop: null });
  });

  it('suma la lluvia por mes y de los últimos días sin rellenar faltantes', () => {
    const days = parsePowerDaily(POWER_FIXTURE as PowerResponse);
    expect(monthlyRain(days)).toEqual([
      { month: '2026-11', rainMm: 4.83, days: 10, missingDays: 3 },
    ]);
    expect(monthlyRain([day('2026-10-01', null)])[0].rainMm).toBeNull();
    // termina en el último día con dato (el 11), no en hoy
    expect(lastDaysRain(days, 7)).toEqual({
      rainMm: 4.83,
      from: '2026-11-05',
      to: '2026-11-11',
      missingDays: 0,
    });
    expect(lastDaysRain([day('2026-11-01', null)], 7)).toBeNull();
    expect(latestSoilWetness(days)).toMatchObject({ date: '2026-11-11', soilTop: 0.37 });
  });

  it('arma el pedido y no vence lo cerrado', async () => {
    const { http, calls } = fakeHttp(() => ({ body: POWER_FIXTURE }));
    const power = new PowerClient(http, () => NOW);
    await power.daily([-33.0841, -61.1891], '2020-01-01', '2025-12-31');
    await power.daily([-33.0841, -61.1891], '2026-01-01', '2026-11-14');
    expect(calls[0].url).toContain('longitude=-61.19&latitude=-33.08&start=20200101&end=20251231');
    expect(calls[0].url).toContain('parameters=PRECTOTCORR,T2M_MAX,T2M_MIN,GWETTOP,GWETROOT');
    expect(calls[0].maxAgeMs).toBe(Infinity);
    expect(calls[1].maxAgeMs).toBe(6 * 3_600_000);
  });
});

describe('catálogo de escenas', () => {
  it('lee ciclo, track, dirección y frame de NISAR, y suma los totales', async () => {
    const { http, calls } = fakeHttp((req) =>
      req.url.includes('PROVISIONAL')
        ? { body: { feed: { entry: CMR_FIXTURE.prov } }, meta: { 'cmr-hits': '19' } }
        : { body: { feed: { entry: CMR_FIXTURE.val } }, meta: { 'cmr-hits': '1' } },
    );
    const res = await new SceneCatalog(http).nisarScenes(LOT3);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('polygon=-61.19583,-33.081878,-61.189497,-33.09009');
    expect(calls[0].keepHeaders).toEqual(['cmr-hits']);
    expect(res.data.total).toBe(20);
    expect(res.data.items[0]).toMatchObject({
      mission: 'NISAR',
      maturity: 'validada',
      start: '2026-10-31T22:08:14.000Z',
    });
    expect(res.data.items[1]).toMatchObject({
      cycle: '033',
      track: '111',
      direction: 'descendente',
      frame: '105',
      maturity: 'provisional',
    });
    expect(res.data.items[2].direction).toBe('ascendente');
    expect(res.incomplete).toBe(false);
  });

  it('trae HLS con nubosidad numérica y marca incompleto si una colección falla', async () => {
    const { http, calls } = fakeHttp((req) => {
      if (req.url.includes('HLSL30')) throw new Error('sin respuesta');
      return { body: { feed: { entry: CMR_FIXTURE.s30 } }, meta: { 'cmr-hits': '17' } };
    });
    const res = await new SceneCatalog(http).hlsScenes(LOT3, '2026-08-01', '2026-11-14');
    expect(calls[0].url).toContain('short_name=HLSS30&version=2.0');
    expect(calls[0].url).toContain('temporal=2026-08-01T00:00:00Z,2026-11-14T23:59:59Z');
    expect(res.data.items[0]).toMatchObject({ mission: 'HLS', cloudCover: 76, track: null });
    expect(res.data.total).toBe(17);
    expect(res.incomplete).toBe(true);
    // la escena del 27/10 tiene 41 % de nubes y la del 01/11, 76 %: con tope 50 queda la del 27
    expect(bestHlsScene(res.data, 50)?.start.slice(0, 10)).toBe('2026-10-27');
    expect(bestHlsScene(res.data, 10)).toBeNull();
    expect(hlsLayerFor(res.data.items[0])).toBe('HLS_S30_Nadir_BRDF_Adjusted_Reflectance');
  });
});

describe('GIBS', () => {
  it('arma teselas por fecha y lee los rangos publicados', async () => {
    const { http, calls } = fakeHttp(() => ({ body: GIBS_S30_DOMAIN_FIXTURE }));
    const gibs = new GibsCatalog(http);
    expect(gibs.tileUrl('HLS_S30_Nadir_BRDF_Adjusted_Reflectance', '2026-11-01')).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/HLS_S30_Nadir_BRDF_Adjusted_Reflectance' +
        '/default/2026-11-01/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png',
    );
    expect(gibs.layers.find((l) => l.id === 'MODIS_Terra_NDVI_8Day')?.maxNativeZoom).toBe(9);
    const res = await gibs.availableDates('HLS_S30_Nadir_BRDF_Adjusted_Reflectance');
    expect(calls[0]).toMatchObject({ as: 'text', maxAgeMs: 6 * 3_600_000 });
    expect(res.data).toHaveLength(17);
    expect(res.data.at(-1)).toEqual({ start: '2026-03-02', end: '2026-11-07' });
    expect(nearestAvailable(res.data)).toBe('2026-11-07');
    expect(nearestAvailable(res.data, '2026-03-01')).toBe('2026-02-28');
    expect(nearestAvailable(parseGibsDomain('<Domain></Domain>'))).toBeNull();
  });
});
