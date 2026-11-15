import type { PolygonGeometry } from '../models';
import { LANDCOVER_CHACO_BLOCK, LANDCOVER_ROSARIO_FIXTURE, LOT1, LOT3, ornlGrid } from './fixtures';
import { latLngToSinusoidal, pointInPolygon, sinusoidalToLatLng } from './geo';
import {
  type LandUseInput,
  landUseEvidence,
  landUseGroup,
  lotLandUse,
  lotPixelIndexes,
} from './land-use';
import type { LatLng } from './models';
import {
  type LandCoverGrid,
  type OrnlSubset,
  type SubsetGrid,
  cellCenter,
  cellRing,
  landCoverWindow,
  parseLandCoverSubset,
} from './modis';

const SAVED = '2026-11-15T12:00:00.000Z';
const CELL = 463.312716528;

/** años armados para la prueba: no son datos de MODIS */
function input(years: [number, (number | null)[]][], extra: Partial<LandUseInput> = {}) {
  return landUseEvidence({
    years: years.map(([year, classes]) => ({ year, classes })),
    baselineYear: 2020,
    pixelCount: years[0]?.[1].length ?? 0,
    pixelSizeM: CELL,
    centroidFallback: false,
    retrievedAt: SAVED,
    ...extra,
  });
}

const every = (from: number, to: number, classes: (number | null)[]) =>
  Array.from({ length: to - from + 1 }, (_, i): [number, (number | null)[]] => [from + i, classes]);

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

/** polígono que cubre justo un bloque de píxeles de la grilla (filas y columnas inclusive) */
function block(grid: SubsetGrid, [r0, r1]: [number, number], [c0, c1]: [number, number]) {
  const at = (r: number, c: number) => r * grid.ncols + c;
  const corners = [
    cellRing(grid, at(r0, c0))[0],
    cellRing(grid, at(r0, c1))[1],
    cellRing(grid, at(r1, c1))[2],
    cellRing(grid, at(r1, c0))[3],
  ];
  return {
    type: 'Polygon' as const,
    coordinates: [[...corners, corners[0]].map(([lat, lng]) => [lng, lat])],
  };
}

describe('grupos de uso IGBP', () => {
  it('junta cultivo y mosaico, y separa natural, urbano y otros', () => {
    expect([12, 14].map(landUseGroup)).toEqual(['agricultural', 'agricultural']);
    expect([1, 5, 9, 10, 11].every((id) => landUseGroup(id) === 'natural')).toBe(true);
    expect(landUseGroup(13)).toBe('urban');
    expect([15, 16, 17].map(landUseGroup)).toEqual(['other', 'other', 'other']);
    // 255 es el relleno de MCD12Q1: no es una clase
    expect([0, 18, 255, 12.5, null].map(landUseGroup)).toEqual([null, null, null, null, null]);
  });
});

describe('veredicto de uso del suelo', () => {
  it('todo cultivo desde 2020: sin cambio, con la clase, el grupo y la fuente', () => {
    const evidence = input(every(2020, 2025, [12, 12, 12]));
    expect(evidence).toMatchObject({
      verdict: 'unchanged',
      baselineYear: 2020,
      lastYear: 2025,
      pixelCount: 3,
      pixelSizeM: CELL,
      centroidFallback: false,
      origin: 'VERIFIED',
    });
    expect(evidence.years).toHaveLength(6);
    expect(evidence.years[0]).toEqual({
      year: 2020,
      group: 'agricultural',
      classId: 12,
      classLabel: 'Cultivo agrícola',
      pixels: 3,
      agriculturalShare: 1,
    });
    expect(evidence.reason).toBe(
      'MODIS vio uso agrícola todos los años de 2020 a 2025 en los 3 píxeles de unos 460 m que cubren tu lote.',
    );
    expect(evidence.source).toMatchObject({ origin: 'VERIFIED', retrievedAt: SAVED });
    expect(evidence.source.product).toContain('MCD12Q1');
    expect(evidence.source.note).toContain('orientativo');
  });

  it('cultivo y mosaico mezclados cuentan como el mismo uso agrícola', () => {
    const evidence = input([
      [2020, [12, 12, 14]],
      [2021, [14, 14, 12]],
      [2022, [14, 14, 14]],
      [2023, [12, 14, 12]],
    ]);
    expect(evidence.verdict).toBe('unchanged');
    expect(evidence.years.map((y) => y.classId)).toEqual([12, 14, 14, 12]);
    expect(evidence.years.every((y) => y.group === 'agricultural')).toBe(true);
  });

  it('pastizal en 2020 y cultivo después: posible cambio, sin afirmarlo', () => {
    const evidence = input([[2020, [10, 10, 12]], ...every(2021, 2025, [12, 12, 12])]);
    expect(evidence.verdict).toBe('possible_change');
    expect(evidence.years[0]).toMatchObject({
      group: 'natural',
      classId: 10,
      classLabel: 'Pastizal',
      agriculturalShare: 0.33,
    });
    expect(evidence.reason).toBe(
      'En 2020 MODIS vio vegetación natural (pastizal) y en 2021, uso agrícola: puede ser un cambio de uso del suelo o un error de clasificación. Conviene revisarlo.',
    );
  });

  it('sin el año base no hay veredicto', () => {
    const evidence = input(every(2021, 2025, [12, 12]));
    expect(evidence).toMatchObject({ verdict: 'no_data', lastYear: 2025 });
    expect(evidence.reason).toContain('no tiene la clasificación de 2020');
    // 2020 vino pero sin clasificar (255 llega como null): tampoco
    const unclassified = input([[2020, [null, null]], ...every(2021, 2025, [12, 12])]);
    expect(unclassified.verdict).toBe('no_data');
    expect(unclassified.years[0]).toMatchObject({ pixels: 0, group: null, classId: null });
    expect(unclassified.years[0].agriculturalShare).toBeNull();
  });

  it('sin píxeles con dato, o solo con el año base, tampoco', () => {
    expect(input(every(2020, 2025, [null, null])).verdict).toBe('no_data');
    expect(input([], { pixelCount: 0 })).toMatchObject({ verdict: 'no_data', lastYear: null });
    const onlyBase = input([[2020, [12]]]);
    expect(onlyBase.verdict).toBe('no_data');
    expect(onlyBase.reason).toContain('falta un año posterior');
  });

  it('un empate de grupos deja el grupo en null y pide revisar', () => {
    // en 2023 la mitad de los píxeles es pastizal: no hay un uso dominante ese año
    const later = input([...every(2020, 2022, [12, 12, 12, 12]), [2023, [12, 12, 10, 10]]]);
    expect(later.years.at(-1)).toMatchObject({
      group: null,
      classId: 10,
      pixels: 4,
      agriculturalShare: 0.5,
    });
    expect(later.verdict).toBe('possible_change');
    expect(later.reason).toContain(
      'en 2023, uso agrícola y vegetación natural en partes iguales: puede ser un cambio',
    );
    // con empate en el año base no se puede confirmar que siguió igual
    const base = input([[2020, [12, 10]], ...every(2021, 2025, [12, 12])]);
    expect(base.years[0].group).toBeNull();
    expect(base.verdict).toBe('possible_change');
    expect(base.reason).toContain('no se puede confirmar que el uso siguió igual');
  });

  it('el grupo es el más frecuente aunque la clase más frecuente sea de otro', () => {
    const evidence = input([
      [2020, [12, 12, 10, 9, 11]],
      ...every(2021, 2022, [12, 12, 10, 9, 11]),
    ]);
    expect(evidence.years[0]).toMatchObject({ group: 'natural', classId: 12 });
    expect(evidence.verdict).toBe('unchanged');
    expect(evidence.reason).toContain('MODIS vio vegetación natural todos los años');
  });

  it('avisa los años sin dato, deja afuera los anteriores al base y no vuelve a ordenar mal', () => {
    const evidence = input([
      [2025, [12]],
      [2019, [10]],
      [2020, [12]],
      [2022, [null]],
      [2021, [14]],
    ]);
    expect(evidence.years.map((y) => y.year)).toEqual([2020, 2021, 2022, 2025]);
    expect(evidence.verdict).toBe('unchanged');
    expect(evidence.reason).toBe(
      'MODIS vio uso agrícola todos los años con dato de 2020 a 2025 (sin dato en 2022, 2023 y 2024) en el único píxel de unos 460 m con su centro dentro de tu lote.',
    );
  });

  it('explica cuando se usó el píxel del centroide o el lote no entró en la ventana', () => {
    const fallback = input(every(2020, 2025, [12]), { centroidFallback: true });
    expect(fallback.centroidFallback).toBe(true);
    expect(fallback.reason).toContain(
      'en el píxel de unos 460 m que contiene el centro de tu lote',
    );
    expect(fallback.reason).toContain('el dato también abarca lo que lo rodea');
    const changed = input(
      [
        [2020, [10]],
        [2021, [12]],
      ],
      { centroidFallback: true, clipped: true },
    );
    expect(changed.reason).toContain('se usó el de unos 460 m que contiene el centro del lote');
    expect(changed.reason).toContain('se leyó solo su parte central');
  });
});

describe('cambios en parte del lote', () => {
  it('un desmonte de un tercio del lote se marca aunque el uso dominante siga igual', () => {
    // armado para la prueba: 3 de los 9 píxeles pasan de pastizal a cultivo en 2022
    const evidence = input([
      ...every(2020, 2021, [10, 10, 10, 12, 12, 12, 12, 12, 12]),
      ...every(2022, 2025, [12, 12, 12, 12, 12, 12, 12, 12, 12]),
    ]);
    // el dominante es agrícola todos los años: solo comparando cada píxel se ve el cambio
    expect(evidence.years.every((y) => y.group === 'agricultural')).toBe(true);
    expect(evidence.verdict).toBe('possible_change');
    expect(evidence.reason).toBe(
      'En 2022 MODIS vio uso agrícola en 3 de los 9 píxeles de tu lote, donde en 2020 había visto vegetación natural: puede ser un cambio de uso del suelo en parte del lote o un error de clasificación. Conviene revisarlo.',
    );
    // si los píxeles que cambian no van todos al mismo uso, se dice sin nombrarlo
    const mixed = input([
      [2020, [12, 12, 12, 12, 12, 12, 12, 12]],
      ...every(2021, 2025, [10, 13, 12, 12, 12, 12, 12, 12]),
    ]);
    expect(mixed.verdict).toBe('possible_change');
    expect(mixed.reason).toContain(
      'En 2021 MODIS vio un uso distinto del de 2020 en 2 de los 8 píxeles de tu lote:',
    );
  });

  it('con datos reales del Chaco: 2 de 6 píxeles de sabana vistos como cultivo', () => {
    // filas 8 y 9 del bloque real: el uso dominante sigue natural, pero un tercio pasa a cultivo
    const evidence = input(
      LANDCOVER_CHACO_BLOCK.map(({ year, classes }) => [year, classes.slice(3)]),
    );
    expect(evidence.years.find((y) => y.year === 2022)?.group).toBe('natural');
    expect(evidence.verdict).toBe('possible_change');
    expect(evidence.reason).toContain(
      'En 2022 MODIS vio uso agrícola en 2 de los 6 píxeles de tu lote, donde en 2020 había visto vegetación natural:',
    );
  });

  it('menos de una cuarta parte del lote no alcanza para marcarlo, pero se dice', () => {
    // los 9 píxeles reales del bloque: 2 cambian en 2022 y 2023
    const chaco = input(LANDCOVER_CHACO_BLOCK.map(({ year, classes }) => [year, classes]));
    expect(chaco.verdict).toBe('unchanged');
    expect(chaco.reason).toBe(
      'MODIS vio vegetación natural todos los años de 2020 a 2025 en al menos 7 de los 9 píxeles de unos 460 m que cubren tu lote. Algún año vio otro uso en 2 de los 9 píxeles, menos de una cuarta parte del lote: puede ser un error de clasificación.',
    );
    // sin ningún píxel que cambie no se agrega nada
    expect(input(every(2020, 2025, [12, 12, 12])).reason).not.toContain('otro uso');
  });

  it('compara cada píxel con su propio año base y no cuenta los que vienen sin dato', () => {
    // un lote mixto que no cambia: ningún píxel cambia de uso
    const mixed = input(every(2020, 2025, [12, 12, 12, 10]));
    expect(mixed.verdict).toBe('unchanged');
    expect(mixed.reason).toContain('en 3 de los 4 píxeles');
    expect(mixed.reason).not.toContain('otro uso');
    // sin dato en 2021 en la mitad de los píxeles: no es un cambio
    const gaps = input([
      [2020, [12, 12, 12, 12]],
      [2021, [null, null, 12, 12]],
      ...every(2022, 2025, [12, 12, 12, 12]),
    ]);
    expect(gaps.verdict).toBe('unchanged');
    expect(gaps.reason).not.toContain('otro uso');
    // un píxel sin dato en el año base tampoco se compara
    const noBase = input([
      [2020, [null, 12, 12, 12, 12]],
      ...every(2021, 2025, [10, 12, 12, 12, 12]),
    ]);
    expect(noBase.verdict).toBe('unchanged');
  });

  it('en un lote chico, un año suelto con otro uso que al siguiente vuelve no alcanza: se dice', () => {
    // armado para la prueba: 1 de los 3 píxeles se ve como pastizal solo en 2022
    const blip = input([
      ...every(2020, 2021, [12, 12, 12]),
      [2022, [12, 12, 10]],
      ...every(2023, 2024, [12, 12, 12]),
    ]);
    expect(blip.verdict).toBe('unchanged');
    expect(blip.reason).toBe(
      'MODIS vio uso agrícola todos los años de 2020 a 2024 en al menos 2 de los 3 píxeles de unos 460 m que cubren tu lote. En 2022 vio otro uso en 1 de los 3 píxeles y al año siguiente ya no: puede ser un error de clasificación.',
    );
    // con un solo píxel el año distinto cambia el dominante: no entra en "todos los años"
    const single = input([[2020, [12]], [2021, [10]], ...every(2022, 2024, [12])]);
    expect(single.verdict).toBe('unchanged');
    expect(single.reason).toBe(
      'MODIS vio uso agrícola todos los años de 2020 a 2024 salvo 2021 en el único píxel de unos 460 m con su centro dentro de tu lote. En 2021 vio otro uso en el píxel del lote y al año siguiente ya no: puede ser un error de clasificación.',
    );
  });

  it('en un lote chico, el cambio que sigue sí se marca, también si es del último año', () => {
    const lasting = input([...every(2020, 2021, [12, 12, 12]), ...every(2022, 2024, [12, 12, 10])]);
    expect(lasting.verdict).toBe('possible_change');
    expect(lasting.reason).toContain(
      'En 2022 MODIS vio vegetación natural en 1 de los 3 píxeles de tu lote, donde en 2020 había visto uso agrícola:',
    );
    const last = input([...every(2020, 2023, [12, 12, 12]), [2024, [12, 12, 10]]]);
    expect(last.verdict).toBe('possible_change');
    expect(last.reason).toContain('En 2024 MODIS vio vegetación natural en 1 de los 3 píxeles');
  });
});

describe('píxeles del lote', () => {
  it('toma los píxeles con el centro dentro del polígono', () => {
    const grid = ornlGrid(landCoverWindow(LOT3));
    const { indexes, centroidFallback } = lotPixelIndexes(grid, LOT3);
    // 86,7 ha son unos 4 píxeles de 21,5 ha: los mismos que dio la consulta real a ORNL
    expect(indexes).toEqual([6, 7, 12, 13]);
    expect(centroidFallback).toBe(false);
    for (let i = 0; i < grid.nrows * grid.ncols; i++) {
      expect(indexes.includes(i)).toBe(pointInPolygon(cellCenter(grid, i), LOT3));
    }
    // el lote de ejemplo 1 (23,4 ha) cae sobre dos centros, como en la consulta real
    expect(lotPixelIndexes(ornlGrid(landCoverWindow(LOT1)), LOT1).indexes).toEqual([11, 12]);
  });

  it('respeta los huecos del polígono', () => {
    const grid = ornlGrid(landCoverWindow(LOT3));
    const { indexes } = lotPixelIndexes(grid, LOT3);
    const hole = square(cellCenter(grid, indexes[0]), 1).coordinates[0];
    const withHole = { type: 'Polygon' as const, coordinates: [...LOT3.coordinates, hole] };
    expect(lotPixelIndexes(grid, withHole).indexes).toEqual(indexes.slice(1));
  });

  it('si ningún centro cae en el lote usa el píxel que contiene el centroide', () => {
    const grid = ornlGrid(landCoverWindow(LOT1));
    // 3 ha dentro del píxel 12 pero corridas un cuarto de píxel hacia el noroeste de su centro
    const [x, y] = latLngToSinusoidal(cellCenter(grid, 12));
    const lot = square(sinusoidalToLatLng(x - CELL / 4, y + CELL / 4), 3);
    expect(pointInPolygon(cellCenter(grid, 12), lot)).toBe(false);
    expect(lotPixelIndexes(grid, lot)).toEqual({ indexes: [12], centroidFallback: true });
  });

  it('arma la evidencia desde la grilla real de Rosario', () => {
    const grid: LandCoverGrid = parseLandCoverSubset(LANDCOVER_ROSARIO_FIXTURE as OrnlSubset);
    // un lote sobre los 3 x 3 píxeles del centro: ciudad, salvo uno de suelo desnudo
    const lot = block(grid, [3, 5], [3, 5]);
    const evidence = lotLandUse(grid, lot, { retrievedAt: SAVED });
    expect(lotPixelIndexes(grid, lot).indexes).toEqual([30, 31, 32, 39, 40, 41, 48, 49, 50]);
    expect(evidence.pixelCount).toBe(9);
    expect(evidence.years.map((y) => [y.year, y.group, y.classId, y.pixels])).toEqual([
      [2020, 'urban', 13, 9],
      [2025, 'urban', 13, 9],
    ]);
    expect(evidence.verdict).toBe('unchanged');
    expect(evidence.reason).toContain('(sin dato en 2021, 2022, 2023 y 2024)');
  });
});
