import type { PolygonGeometry } from '../models';
import { cellOverlap } from './geo';
import type { LatLng, NdviGrid, NdviObservation, NdviPixel } from './models';
import { isMixedPixel, ndviSummary, observeLot, zonesByTerciles } from './summary';

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
  it('promedia los píxeles que caen dentro del polígono', () => {
    const obs = observeLot(grid(VALUES), square(0, 3));
    expect(obs).toMatchObject({ pixels: 9, validPixels: 9, quality: 'good', centroidOnly: false });
    // pondera por superficie: celdas de 1° casi iguales cerca del ecuador
    expect(obs.mean).toBeCloseTo(0.4667, 3);
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
    expect(obs.mean).toBeCloseTo((0.2 + 0.4 + 0.6 + 0.3 + 0.7 + 0.6) / 6, 3);
  });

  it('un lote más chico que un píxel toma el píxel que lo contiene', () => {
    const obs = observeLot(grid(VALUES), square(2.2, 2.4));
    // el lote cae entero en el píxel con centro (2.5, 2.5)
    expect(obs).toMatchObject({ pixels: 1, validPixels: 1, centroidOnly: false, mean: 0.6 });
    const cloudy = observeLot(grid(VALUES, Array(16).fill(3)), square(2.2, 2.4));
    expect(cloudy).toMatchObject({ mean: null, quality: 'cloudy', validPixels: 0 });
    const empty = observeLot(grid(Array(16).fill(null), Array(16).fill(-1)), square(0, 3));
    expect(empty.quality).toBe('no_data');
  });

  it('pondera por la superficie de cada píxel dentro del lote', () => {
    // lote de lng 0 a 1,1 y lat 1 a 2: casi todo en el píxel (1.5, 0.5) y una tira de 0,1° en
    // el (1.5, 1.5). Con promedio simple daría (0.3 + 0.5) / 2 = 0.4
    const lot: PolygonGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 1],
          [1.1, 1],
          [1.1, 2],
          [0, 2],
          [0, 1],
        ],
      ],
    };
    const obs = observeLot(grid(VALUES), lot);
    expect(obs.pixels).toBe(2);
    expect(obs.mean).toBeCloseTo((0.3 * 1 + 0.5 * 0.1) / 1.1, 3);
  });

  it('sin píxeles que toquen el lote usa el del centroide', () => {
    const outside = observeLot(grid(VALUES), square(10, 11));
    expect(outside.centroidOnly).toBe(true);
    expect(outside.pixels).toBe(1);
  });
});

describe('cellOverlap', () => {
  const cell: LatLng[] = [
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 0],
  ];

  it('recorta el píxel al lote y da su área', () => {
    // un lote que solo comparte el borde de abajo (lat 1) no aporta superficie
    expect(cellOverlap(cell, square(0, 1)).areaHa).toBe(0);
    const inside = cellOverlap(cell, square(0, 3));
    const whole = (111.195 * 1000) ** 2 / 10_000; // ~1° x 1° cerca del ecuador, en ha
    expect(inside.areaHa / whole).toBeGreaterThan(0.99);
    expect(inside.rings).toHaveLength(1);
  });

  it('un lote que cubre parte del píxel da solo esa parte', () => {
    const part = cellOverlap(cell, square(0, 1.25));
    const whole = cellOverlap(cell, square(0, 3)).areaHa;
    // lng 0..1 y lat 1..1,25: un cuarto del píxel
    expect(part.areaHa / whole).toBeCloseTo(0.25, 2);
    for (const [lat, lng] of part.rings[0]) {
      expect(lat).toBeLessThanOrEqual(1.25 + 1e-9);
      expect(lng).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('descuenta los huecos del lote', () => {
    // el hueco lng 1..2, lat 1..2 tapa entero al píxel de esa posición
    const covered: LatLng[] = [
      [2, 1],
      [2, 2],
      [1, 2],
      [1, 1],
    ];
    expect(cellOverlap(covered, square(0, 3, [1, 2])).areaHa).toBe(0);
    expect(cellOverlap(cell, square(0, 3, [1, 2])).areaHa).toBeGreaterThan(0);
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

describe('píxeles mixtos', () => {
  it('cuenta aparte la superficie de los píxeles que no caen enteros en el lote', () => {
    const g = grid(VALUES);
    // fila de abajo: dos píxeles enteros y uno con solo el 10 % dentro del lote
    const share = (i: number, insideShare: number, insideHa: number) => {
      g.pixels[i] = { ...g.pixels[i], inside: true, insideShare, insideHa };
    };
    for (const p of g.pixels) Object.assign(p, { inside: false });
    // NDVI 0,1 a 0,9: cortes en 0,367 y 0,633, así que el 0,6 mixto cae en medio
    share(12, 1, 10); // 0.1
    share(15, 1, 10); // 0.9
    share(14, 0.1, 1); // 0.6
    const z = zonesByTerciles(g);
    const byLevel = Object.fromEntries(z.zones.map((zone) => [zone.level, zone]));
    expect(byLevel['alto'].share).toBeCloseTo(10 / 21, 4);
    expect(byLevel['alto'].mixedShare).toBe(0);
    expect(byLevel['medio'].share).toBeCloseTo(1 / 21, 4);
    expect(byLevel['medio'].mixedShare).toBeCloseTo(1 / 21, 4);
  });

  it('un píxel entero no es mixto y uno sin recorte tampoco', () => {
    const base = grid(VALUES).pixels[0];
    expect(isMixedPixel({ ...base, insideShare: 1 })).toBe(false);
    expect(isMixedPixel({ ...base, insideShare: 0.4 })).toBe(true);
    // la mayor parte adentro: no es mixto aunque no esté entero
    expect(isMixedPixel({ ...base, insideShare: 0.7 })).toBe(false);
    expect(isMixedPixel(base)).toBe(false);
  });
});
