import type { PolygonGeometry } from '../models';
import {
  LANDCOVER_LOT3_FIXTURE,
  LANDCOVER_ROSARIO_FIXTURE,
  LANDCOVER_ROSARIO_SINGLE_PIXELS,
  LOT1,
  LOT3,
  NDVI_LOT3_FIXTURE,
  NDVI_RIVER_FIXTURE,
  RELIABILITY_LOT3_FIXTURE,
  ornlGrid,
} from './fixtures';
import {
  centroid,
  cmrPolygon,
  latLngToSinusoidal,
  pointInPolygon,
  sinusoidalToLatLng,
} from './geo';
import type { NasaHttp, NasaRequest } from './http';
import type { LatLng } from './models';
import {
  LANDCOVER_CELL_M,
  MODIS_CELL_M,
  ModisClient,
  type OrnlSubset,
  batchDates,
  cellAt,
  cellCenter,
  cellRing,
  compositeBatches,
  compositeFromIndex,
  compositeIndexAt,
  landCoverWindow,
  parseLandCoverSubset,
  parseNdviSubset,
  subsetGrid,
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

  it('pasa de grados a la grilla sinusoidal y vuelve', () => {
    const [x, y] = latLngToSinusoidal([-33.0433, -61.2128]);
    // x = R·lon·cos(lat), y = R·lat
    expect(y).toBeCloseTo(6371007.181 * ((-33.0433 * Math.PI) / 180), 3);
    expect(x).toBeCloseTo(
      6371007.181 * ((-61.2128 * Math.PI) / 180) * Math.cos((-33.0433 * Math.PI) / 180),
      3,
    );
    const [lat, lng] = sinusoidalToLatLng(x, y);
    expect(lat).toBeCloseTo(-33.0433, 9);
    expect(lng).toBeCloseTo(-61.2128, 9);
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
    // la misma url de siempre: las copias guardadas en los dispositivos siguen sirviendo
    expect(calls[0].url).toMatch(
      /^https:\/\/modis\.ornl\.gov\/rst\/api\/v1\/MCD12Q1\/subset\?latitude=-33\.\d{1,4}&longitude=-61\.\d{1,4}&band=LC_Type1&startDate=A2020001&endDate=A2026001&kmAboveBelow=0&kmLeftRight=0$/,
    );
    expect(res.data).toHaveLength(6);
    expect(res.data[0]).toEqual({ year: 2020, classId: 12, label: 'Cultivo agrícola' });
  });
});

/** cuadrado de unas ha centrado en un punto */
function square([lat, lng]: LatLng, ha: number): PolygonGeometry {
  const half = Math.sqrt(ha * 10_000) / 2;
  const dLat = half / 111_195;
  const dLng = half / (111_195 * Math.cos((lat * Math.PI) / 180));
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  };
}

describe('grilla de cobertura del suelo (MCD12Q1)', () => {
  it('lee data de norte a sur y de oeste a este (costa de Rosario, datos reales)', () => {
    // verificado el 2026-11-15 con la grilla real de 9 x 9 píxeles alrededor de
    // (-32.9468, -60.6393): el Paraná (17) baja del noroeste al sudeste, la ciudad (13) queda al
    // sudoeste y las islas (11) al noreste. y dos pedidos de un solo píxel en lugares que se leen
    // distinto según el orden devuelven lo mismo que la grilla
    const grid = parseLandCoverSubset(LANDCOVER_ROSARIO_FIXTURE as OrnlSubset);
    expect(grid).toMatchObject({ nrows: 9, ncols: 9, cellSizeM: LANDCOVER_CELL_M });
    expect(grid.years.map((y) => y.year)).toEqual([2020, 2025]);
    const [y2020] = grid.years;
    const mean = (classId: number, axis: 0 | 1) => {
      const values = y2020.classes.flatMap((c, i) =>
        c === classId ? [cellCenter(grid, i)[axis]] : [],
      );
      return values.reduce((s, v) => s + v, 0) / values.length;
    };
    // el agua y las islas quedan al este de la ciudad, y las islas también al norte
    expect(mean(17, 1)).toBeGreaterThan(mean(13, 1));
    expect(mean(11, 1)).toBeGreaterThan(mean(13, 1));
    expect(mean(11, 0)).toBeGreaterThan(mean(13, 0));
    // la fila de arriba es la del norte: la de las islas; la de abajo, toda ciudad
    expect(y2020.classes.slice(0, 9).filter((c) => c === 11).length).toBe(7);
    expect(y2020.classes.slice(72).every((c) => c === 13)).toBe(true);
    // el punto pedido cae en el píxel del medio
    expect(cellAt(grid, [-32.9468, -60.6393])).toBe(40);
    for (const pixel of LANDCOVER_ROSARIO_SINGLE_PIXELS) {
      const index = cellAt(grid, [pixel.latitude, pixel.longitude]);
      expect(index).not.toBeNull();
      expect(y2020.classes[index ?? -1]).toBe(pixel.data[0]);
    }
  });

  it('deja en null el relleno y lo que no es una clase IGBP', () => {
    const fixture = LANDCOVER_ROSARIO_FIXTURE;
    const [first] = fixture.subset;
    const grid = parseLandCoverSubset({
      ...fixture,
      subset: [{ ...first, data: [255, 0, 18, ...first.data.slice(3)] }],
    } as OrnlSubset);
    expect(grid.years[0].classes.slice(0, 4)).toEqual([null, null, null, 11]);
  });

  it('ubica cada píxel con su esquina y su centro, y encuentra el que contiene un punto', () => {
    const grid = subsetGrid(LANDCOVER_ROSARIO_FIXTURE as OrnlSubset);
    for (const index of [0, 8, 40, 72, 80]) {
      const center = cellCenter(grid, index);
      expect(cellAt(grid, center)).toBe(index);
      const ring = cellRing(grid, index);
      // el centro queda entre las esquinas de arriba y las de abajo
      expect(center[0]).toBeLessThan(ring[0][0]);
      expect(center[0]).toBeGreaterThan(ring[2][0]);
    }
    expect(cellAt(grid, [-32.8, -60.6393])).toBeNull();
    expect(cellAt(grid, [-32.9468, -60.5])).toBeNull();
  });

  it('la grilla de las pruebas coincide con la que arma ORNL', () => {
    // las esquinas reales de los fixtures, al centímetro
    const rosario = ornlGrid({ center: [-32.9468, -60.6393], kmNs: 2, kmEw: 2 });
    expect(rosario.xll).toBeCloseTo(Number(LANDCOVER_ROSARIO_FIXTURE.xllcorner), 0);
    expect(rosario.yll).toBeCloseTo(Number(LANDCOVER_ROSARIO_FIXTURE.yllcorner), 0);
    expect([rosario.nrows, rosario.ncols]).toEqual([9, 9]);
    const ndvi = ornlGrid({ center: [-32.95, -60.62], kmNs: 2, kmEw: 2 }, MODIS_CELL_M);
    expect(ndvi.xll).toBeCloseTo(Number(NDVI_RIVER_FIXTURE.xllcorner), 0);
    expect(ndvi.yll).toBeCloseTo(Number(NDVI_RIVER_FIXTURE.yllcorner), 0);
  });

  it('calcula la ventana en la grilla sinusoidal para cubrir todo el lote', () => {
    expect(landCoverWindow(LOT1)).toEqual({
      center: [-33.0433, -61.2128],
      kmNs: 1,
      kmEw: 1,
      clipped: false,
    });
    expect(windowKm(0.9, LANDCOVER_CELL_M)).toBe(1);
    expect(windowKm(0.95, LANDCOVER_CELL_M)).toBe(2);
    // una franja norte-sur de 4 km por 100 m: en grados es angosta, pero en la grilla las columnas
    // se inclinan y hace falta más ancho
    const strip: PolygonGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [-61.2, -33.06],
          [-61.1989, -33.06],
          [-61.1989, -33.024],
          [-61.2, -33.024],
          [-61.2, -33.06],
        ],
      ],
    };
    // con la caja en grados alcanzaría 1 km a cada lado; en la grilla hacen falta 2
    expect(windowKm(0.05, LANDCOVER_CELL_M)).toBe(1);
    expect(landCoverWindow(strip)).toMatchObject({ kmNs: 3, kmEw: 2, clipped: false });
    // cada vértice de cada lote cae dentro de la grilla que devolvería ORNL
    for (const lot of [
      LOT1,
      LOT3,
      strip,
      square([-33.07, -61.23], 10),
      square([-33.07, -61.23], 2000),
    ]) {
      const grid = ornlGrid(landCoverWindow(lot));
      for (const [lng, lat] of lot.coordinates[0]) expect(cellAt(grid, [lat, lng])).not.toBeNull();
    }
  });

  it('pone un tope a la ventana y avisa que el lote no entró entero', () => {
    const huge = square([-33.07, -61.23], 20_000);
    expect(landCoverWindow(huge)).toMatchObject({ kmNs: 5, kmEw: 5, clipped: true });
    expect(landCoverWindow(huge, 20)).toMatchObject({ kmNs: 8, kmEw: 12, clipped: false });
    // el centro va redondeado como en la url: se mide desde el punto que se pide
    const { center } = landCoverWindow(LOT3);
    expect(center).toEqual(center.map((v) => Math.round(v * 10_000) / 10_000));
  });

  it('pide la grilla de todos los años en un solo pedido y junta las tandas de 10 años', async () => {
    const { http, calls } = fakeHttp(() => LANDCOVER_ROSARIO_FIXTURE);
    const modis = new ModisClient(http, () => NOW);
    const res = await modis.landCoverGrid({ center: [-32.9468, -60.6393], kmNs: 2, kmEw: 2 });
    expect(calls.map((c) => c.url)).toEqual([
      'https://modis.ornl.gov/rst/api/v1/MCD12Q1/subset?latitude=-32.9468&longitude=-60.6393' +
        '&band=LC_Type1&startDate=A2020001&endDate=A2026001&kmAboveBelow=2&kmLeftRight=2',
    ]);
    expect(calls[0]).toMatchObject({
      service: 'ornl',
      maxAgeMs: 7 * 24 * 3_600_000,
      headers: { Accept: 'application/json' },
    });
    expect(res).toMatchObject({ stale: false, savedAt: '2026-11-14T12:00:00.000Z' });
    expect(res.data.years.map((y) => y.year)).toEqual([2020, 2025]);
    // desde 2010 son dos pedidos (2010 a 2019 y 2020 a 2026) con los años juntos y en orden
    const older = fakeHttp((req) => ({
      ...LANDCOVER_ROSARIO_FIXTURE,
      subset: req.url.includes('startDate=A2010001')
        ? [
            {
              ...LANDCOVER_ROSARIO_FIXTURE.subset[0],
              modis_date: 'A2015001',
              calendar_date: '2015-01-01',
            },
          ]
        : LANDCOVER_ROSARIO_FIXTURE.subset,
    }));
    const merged = await new ModisClient(older.http, () => NOW).landCoverGrid(
      { center: [-32.9468, -60.6393], kmNs: 2, kmEw: 2 },
      2010,
    );
    expect(older.calls.map((c) => c.url.match(/startDate=\w+&endDate=\w+/)?.[0])).toEqual([
      'startDate=A2010001&endDate=A2019001',
      'startDate=A2020001&endDate=A2026001',
    ]);
    expect(merged.data.years.map((y) => y.year)).toEqual([2015, 2020, 2025]);
  });
});
