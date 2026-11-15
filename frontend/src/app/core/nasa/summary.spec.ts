import type { PolygonGeometry } from '../models';
import type { NdviGrid, NdviObservation, NdviPixel } from './models';
import { ndviSummary, observeLot, zonesByTerciles } from './summary';

/** grilla de 4 x 4 píxeles de 1° con centros en 0.5, 1.5, 2.5 y 3.5 */
function grid(values: (number | null)[], reliability: number[] = []): NdviGrid {
  const pixels: NdviPixel[] = values.map((value, i) => {
    const lat = 3.5 - Math.floor(i / 4);
    const lng = 0.5 + (i % 4);
    return {
      ring: [
        [lat + 0.5, lng - 0.5],
        [lat + 0.5, lng + 0.5],
        [lat - 0.5, lng + 0.5],
        [lat - 0.5, lng - 0.5],
      ],
      center: [lat, lng],
      value,
      reliability: reliability[i] ?? 0,
      inside: lat < 3 && lng < 3,
    };
  });
  return { date: '2026-10-16', satellite: 'Terra', cellSizeM: 231.66, pixels };
}

const square = (min: number, max: number, hole?: [number, number]): PolygonGeometry => ({
  type: 'Polygon',
  coordinates: [
    [
      [min, min],
      [max, min],
      [max, max],
      [min, max],
      [min, min],
    ],
    ...(hole
      ? [
          [
            [hole[0], hole[0]],
            [hole[1], hole[0]],
            [hole[1], hole[1]],
            [hole[0], hole[1]],
            [hole[0], hole[0]],
          ],
        ]
      : []),
  ],
});

// fila de arriba (lat 3.5) primero
const VALUES = [0.9, 0.9, 0.9, 0.9, 0.2, 0.4, 0.6, 0.9, 0.3, 0.5, 0.7, 0.9, 0.1, 0.8, 0.6, 0.9];

describe('NDVI del lote', () => {
  it('promedia los píxeles con centro dentro del polígono', () => {
    const obs = observeLot(grid(VALUES), square(0, 3));
    expect(obs).toMatchObject({ pixels: 9, validPixels: 9, quality: 'good', centroidOnly: false });
    expect(obs.mean).toBeCloseTo(0.4667, 4);
    expect([obs.min, obs.max]).toEqual([0.1, 0.8]);
  });

  it('descarta el hueco, los nublados y los sin dato', () => {
    const values: (number | null)[] = [...VALUES];
    values[13] = null;
    const reliability = Array(16).fill(0);
    reliability[12] = 3;
    reliability[10] = 1;
    // el hueco saca el píxel central (1.5, 1.5)
    const obs = observeLot(grid(values, reliability), square(0, 3, [1, 2]));
    expect(obs.pixels).toBe(8);
    expect(obs.validPixels).toBe(6);
    expect(obs.quality).toBe('marginal');
    expect(obs.mean).toBeCloseTo((0.2 + 0.4 + 0.6 + 0.3 + 0.7 + 0.6) / 6, 4);
  });

  it('sin píxeles adentro usa el del centroide', () => {
    const obs = observeLot(grid(VALUES), square(2.2, 2.4));
    // el centroide (2.3, 2.3) cae en el píxel con centro (2.5, 2.5)
    expect(obs).toMatchObject({ pixels: 1, validPixels: 1, centroidOnly: true, mean: 0.6 });
    const cloudy = observeLot(grid(VALUES, Array(16).fill(3)), square(2.2, 2.4));
    expect(cloudy).toMatchObject({ mean: null, quality: 'cloudy', validPixels: 0 });
    const empty = observeLot(grid(Array(16).fill(null), Array(16).fill(-1)), square(0, 3));
    expect(empty.quality).toBe('no_data');
  });
});

const obs = (date: string, mean: number | null): NdviObservation => ({
  date,
  satellite: 'Terra',
  mean,
  min: mean,
  max: mean,
  pixels: 4,
  validPixels: mean === null ? 0 : 4,
  quality: mean === null ? 'cloudy' : 'good',
  centroidOnly: false,
});

describe('ndviSummary', () => {
  it('compara contra el compuesto anterior y contra el año anterior', () => {
    const s = ndviSummary([
      obs('2025-10-16', 0.3),
      obs('2026-09-30', 0.5),
      obs('2026-10-16', 0.62),
      obs('2026-11-01', null),
    ]);
    expect(s.latest?.date).toBe('2026-10-16');
    expect(s.changeVsPrevious).toBe(0.12);
    expect(s.changeVsLastYear).toBe(0.32);
  });

  it('no interpola: sin el compuesto anterior o sin el del año pasado, la variación es null', () => {
    const s = ndviSummary([obs('2026-09-30', null), obs('2026-10-16', 0.62)]);
    expect(s.previous).toBeNull();
    expect(s.changeVsPrevious).toBeNull();
    expect(s.changeVsLastYear).toBeNull();
    // un hueco de 32 días no es "el compuesto anterior"
    expect(
      ndviSummary([obs('2026-09-14', 0.4), obs('2026-10-16', 0.6)]).changeVsPrevious,
    ).toBeNull();
    expect(ndviSummary([]).latest).toBeNull();
  });
});

describe('zonesByTerciles', () => {
  it('parte el rango de los píxeles válidos del lote en tres partes iguales', () => {
    const z = zonesByTerciles(grid(VALUES));
    expect([z.min, z.max, z.validPixels]).toEqual([0.1, 0.8, 9]);
    expect(z.zones.map((zone) => zone.level)).toEqual(['alto', 'medio', 'bajo']);
    const [alto, medio, bajo] = z.zones;
    // cortes en 0.3333 y 0.5667
    expect(alto.pixels.map((p) => p.value).sort()).toEqual([0.6, 0.6, 0.7, 0.8]);
    expect(medio.pixels.map((p) => p.value).sort()).toEqual([0.4, 0.5]);
    expect(bajo.pixels.map((p) => p.value).sort()).toEqual([0.1, 0.2, 0.3]);
    expect(alto.share + medio.share + bajo.share).toBeCloseTo(1, 3);
    expect(bajo.from).toBe(0.1);
  });

  it('avisa cuando no alcanza para separar ambientes', () => {
    expect(zonesByTerciles(grid(Array(16).fill(0.5))).note).toContain('parejo');
    expect(zonesByTerciles(grid(Array(16).fill(null))).zones).toEqual([]);
  });
});
