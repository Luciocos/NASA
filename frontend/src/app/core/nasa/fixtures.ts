import { latLngToSinusoidal } from './geo';
import { LANDCOVER_CELL_M, type ModisWindow, type SubsetGrid } from './modis';

// respuestas reales recortadas, obtenidas el 2026-11-14 para el lote 3 de Casilda
// y para el río Paraná frente a Rosario (lat -32.95, lon -60.62)
export const POWER_FIXTURE = {
  properties: {
    parameter: {
      PRECTOTCORR: {
        '20261105': 0.0,
        '20261106': 0.08,
        '20261107': 3.55,
        '20261108': 0.0,
        '20261109': 0.0,
        '20261110': 0.85,
        '20261111': 0.35,
        '20261112': -999.0,
        '20261113': -999.0,
        '20261114': -999.0,
      },
      T2M_MAX: {
        '20261105': 29.83,
        '20261106': 28.41,
        '20261107': 23.12,
        '20261108': 26.07,
        '20261109': 28.76,
        '20261110': 26.32,
        '20261111': 31.4,
        '20261112': -999.0,
        '20261113': -999.0,
        '20261114': -999.0,
      },
      T2M_MIN: {
        '20261105': 14.18,
        '20261106': 15.54,
        '20261107': 11.98,
        '20261108': 9.26,
        '20261109': 12.21,
        '20261110': 15.76,
        '20261111': 17.09,
        '20261112': -999.0,
        '20261113': -999.0,
        '20261114': -999.0,
      },
      GWETTOP: {
        '20261105': 0.4,
        '20261106': 0.36,
        '20261107': 0.44,
        '20261108': 0.39,
        '20261109': 0.35,
        '20261110': 0.35,
        '20261111': 0.37,
        '20261112': -999.0,
        '20261113': -999.0,
        '20261114': -999.0,
      },
      GWETROOT: {
        '20261105': 0.49,
        '20261106': 0.48,
        '20261107': 0.48,
        '20261108': 0.48,
        '20261109': 0.48,
        '20261110': 0.47,
        '20261111': 0.47,
        '20261112': -999.0,
        '20261113': -999.0,
        '20261114': -999.0,
      },
    },
  },
  parameters: {
    PRECTOTCORR: { units: 'mm/day', longname: 'Precipitation Corrected' },
    T2M_MAX: { units: 'C', longname: 'Temperature at 2 Meters Maximum' },
    T2M_MIN: { units: 'C', longname: 'Temperature at 2 Meters Minimum' },
    GWETTOP: { units: '1', longname: 'Surface Soil Wetness' },
    GWETROOT: { units: '1', longname: 'Root Zone Soil Wetness' },
  },
};
export const NDVI_LOT3_FIXTURE = {
  xllcorner: '-5701757.97',
  yllcorner: '-3679861.25',
  cellsize: 231.656358264,
  nrows: 9,
  ncols: 9,
  band: '250m_16_days_NDVI',
  scale: '0.0001',
  latitude: -33.085,
  longitude: -61.189,
  subset: [
    {
      modis_date: 'A2026273',
      calendar_date: '2026-09-30',
      band: '250m_16_days_NDVI',
      data: [
        4459, 3450, 3450, 2865, 2865, 2865, 3532, 4271, 3449, 4459, 3248, 3248, 3248, 2704, 2865,
        3532, 3532, 3532, 4326, 802, 802, 3248, 2704, 2704, 4380, 4380, 4380, 3963, 802, 802, 2935,
        2745, 2745, 2745, 4380, 4380, 3963, 3963, 2897, 2897, 2897, 2745, 2745, 2904, 2904, 3192,
        3192, 2832, 2832, 2897, 2750, 2750, 2806, 2806, 2779, 2779, 2832, 2832, 2832, 2704, 2704,
        2704, 2806, 2779, 2779, 2779, 3140, 3140, 3140, 2704, 2704, 3036, 2839, 2972, 2972, 3425,
        3140, 3140, 3923, 3923, 3923,
      ],
    },
    {
      modis_date: 'A2026289',
      calendar_date: '2026-10-16',
      band: '250m_16_days_NDVI',
      data: [
        3551, 3257, 3165, 3436, 3436, 3299, 3299, 5290, 4147, 4139, 4139, 3396, 3396, 3379, 3299,
        3299, 3543, 3543, 4198, 3895, 3396, 3396, 3379, 3379, 3683, 6091, 6091, 4784, 3370, 3370,
        3530, 3530, 3238, 3561, 3561, 3932, 4090, 4090, 3391, 3774, 3774, 3550, 3550, 3354, 3354,
        3655, 3753, 3614, 2909, 3627, 3627, 3597, 3354, 3354, 3116, 3148, 3148, 3627, 3627, 3627,
        3597, 3597, 3238, 3270, 3800, 3800, 3627, 3627, 4423, 3132, 3132, 3067, 3270, 3270, 3800,
        4321, 4321, 3939, 3939, 4893, 4893,
      ],
    },
  ],
};
export const RELIABILITY_LOT3_FIXTURE = {
  xllcorner: '-5701757.97',
  yllcorner: '-3679861.25',
  cellsize: 231.656358264,
  nrows: 9,
  ncols: 9,
  band: '250m_16_days_pixel_reliability',
  scale: 'Not Available',
  latitude: -33.084,
  longitude: -61.189,
  subset: [
    {
      modis_date: 'A2026273',
      calendar_date: '2026-09-30',
      band: '250m_16_days_pixel_reliability',
      data: [
        3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
        3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
        3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
      ],
    },
    {
      modis_date: 'A2026289',
      calendar_date: '2026-10-16',
      band: '250m_16_days_pixel_reliability',
      data: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
    },
  ],
};
export const NDVI_RIVER_FIXTURE = {
  xllcorner: '-5658438.18',
  yllcorner: '-3665961.87',
  cellsize: 231.656358264,
  nrows: 17,
  ncols: 17,
  band: '250m_16_days_NDVI',
  scale: '0.0001',
  latitude: -32.95,
  longitude: -60.62,
  subset: [
    {
      modis_date: 'A2026273',
      calendar_date: '2026-09-30',
      band: '250m_16_days_NDVI',
      data: [
        4077, 5755, 5755, 5645, 5907, 5907, 6086, 6086, 5533, 5533, 6798, 6798, 6798, 6555, 6555,
        6333, 2822, -3000, -1336, 5755, 5645, 5645, 5645, 5387, 5387, 5533, 5533, 5533, 5940, 5940,
        5976, 5976, 6333, 2929, -3000, -1336, -1336, -1336, 3559, 3559, 5105, 5387, 5387, 5027,
        5027, 3737, 3737, 5976, 5976, 5976, 5853, 1005, 1005, -3000, -3000, -1954, 3559, 5105, 5105,
        5105, 5187, 5187, 3737, 3737, 3737, 4408, 4408, 4259, 1564, 1564, 1527, -3000, -1954, -1954,
        -1954, 1623, 1623, 5187, 5187, 5187, 4051, 4051, 3050, 3050, 4259, 1545, 1564, 1699, 1527,
        1527, -1616, -1616, 1623, 1623, 1623, 4427, 4427, 5229, 5229, 3050, 3050, 3050, 1166, 1285,
        1285, 2667, 2667, -1980, -1980, -119, -92, -159, 952, 952, 111, 116, 5229, 4931, 4931, 1173,
        1002, 1002, 2394, 2394, 1241, 1241, 1061, -81, -261, 841, 841, 7, 40, 709, 1008, 1008, 1218,
        1117, 1117, 1596, 1723, 1723, 2784, 2784, -3000, -3000, -206, -67, 99, -26, -26, 83, 617,
        1218, 1152, 1125, 1125, 1354, 1354, 2812, 2812, -168, -168, -56, -82, -175, 18, -11, 68,
        -462, 1179, 1179, 1234, 1234, 1284, 1354, 2049, 2049, 2066, 1948, 1948, -1035, -79, 19,
        -150, -103, 450, 1389, 1389, 1219, 1234, 1360, 1420, 1420, 2245, 2245, 1856, 1856, -1557,
        -158, 24, -65, -230, 202, 1345, 1389, 1485, 1600, 1600, 1926, 1926, 2101, 2101, 3452, 3452,
        3548, -205, -205, -839, -839, -577, 1797, 1904, 1904, 1796, 1796, 1918, 1918, 2228, 2228,
        2381, 3183, 3183, 696, 696, -409, -70, -303, 1951, 2066, 2066, 1753, 1669, 1669, 1698, 1698,
        2637, 2637, 3258, 3258, 1297, 1297, 1515, 1220, 1220, 2714, 1951, 2066, 2099, 1781, 1781,
        1932, 1932, 2414, 2414, 3279, 3279, 2391, 1297, 2393, 1241, 1241, 2714, 1991, 2172, 2172,
        2351, 2351, 1932, 1932, 1932, 2195, 2616, 3576, 2808, 1970, 2463, 2393, 10,
      ],
    },
  ],
};
export const LANDCOVER_LOT3_FIXTURE = {
  xllcorner: '-5701062.94',
  yllcorner: '-3679166.28',
  cellsize: 463.312716528,
  nrows: 1,
  ncols: 1,
  band: 'LC_Type1',
  scale: 'Not Available',
  latitude: -33.084,
  longitude: -61.189,
  subset: [
    { modis_date: 'A2020001', calendar_date: '2020-01-01', band: 'LC_Type1', data: [12] },
    { modis_date: 'A2021001', calendar_date: '2021-01-01', band: 'LC_Type1', data: [12] },
    { modis_date: 'A2022001', calendar_date: '2022-01-01', band: 'LC_Type1', data: [12] },
    { modis_date: 'A2023001', calendar_date: '2023-01-01', band: 'LC_Type1', data: [12] },
    { modis_date: 'A2024001', calendar_date: '2024-01-01', band: 'LC_Type1', data: [12] },
    { modis_date: 'A2025001', calendar_date: '2025-01-01', band: 'LC_Type1', data: [12] },
  ],
};
export const CMR_FIXTURE = {
  prov: [
    {
      title:
        'NISAR_L2_PR_GCOV_033_111_D_105_2005_DHDH_A_20261019T220814_20261019T220849_P05023_N_F_J_001',
      time_start: '2026-10-19T22:08:14.000Z',
    },
    {
      title:
        'NISAR_L2_PR_GCOV_033_089_A_161_2005_DHDH_A_20261018T100254_20261018T100328_P05023_N_F_J_001',
      time_start: '2026-10-18T10:02:54.000Z',
    },
  ],
  val: [
    {
      title:
        'NISAR_L2_PR_GCOV_034_111_D_105_2005_DHDH_A_20261031T220814_20261031T220849_P05036_N_F_J_001',
      time_start: '2026-10-31T22:08:14.000Z',
    },
  ],
  s30: [
    {
      title: 'HLS.S30.T20HPJ.2026305T135709.v2.0',
      time_start: '2026-11-01T14:11:51.353Z',
      cloud_cover: '76',
    },
    {
      title: 'HLS.S30.T20HPJ.2026300T135701.v2.0',
      time_start: '2026-10-27T14:11:48.958Z',
      cloud_cover: '41',
    },
  ],
  l30: [
    {
      title: 'HLS.L30.T20HPJ.2026304T135618.v2.0',
      time_start: '2026-10-31T13:56:18.853Z',
      cloud_cover: '0',
    },
  ],
};
export const GIBS_S30_DOMAIN_FIXTURE =
  "<Domains xmlns:ows='http://www.opengis.net/ows/1.1'><SpaceDomain><BoundingBox miny='-20037508.342789' maxx='20037508.342789' crs='urn:ogc:def:crs:EPSG::3857' minx='-20037508.342789' maxy='20037508.342789'/></SpaceDomain><DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2015-11-28/2015-12-11/P1D,2015-12-15/2016-01-26/P1D,2016-01-28/2016-02-20/P1D,2016-03-01/2017-01-20/P1D,2017-01-23/2021-08-09/P1D,2021-08-12/2021-08-12/P1D,2021-08-14/2021-08-17/P1D,2021-08-19/2021-11-02/P1D,2021-11-04/2021-12-12/P1D,2021-12-15/2021-12-17/P1D,2021-12-20/2023-07-12/P1D,2023-07-14/2025-08-24/P1D,2025-08-26/2025-11-10/P1D,2025-11-12/2025-12-09/P1D,2025-12-11/2026-01-10/P1D,2026-01-12/2026-02-28/P1D,2026-03-02/2026-11-07/P1D</Domain><Size>17</Size></DimensionDomain></Domains>";
export const ORNL_TOO_MANY_DATES_BODY =
  '"Subset time period A2026001 to A2026289 exceeds maximum subset tiles support of 10."';
/** lote 3 de Casilda (pipeline/lots.geojson), dibujado en sentido horario */
export const LOT3 = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-61.19583, -33.081878],
      [-61.188656, -33.077957],
      [-61.182322, -33.086169],
      [-61.189497, -33.09009],
      [-61.19583, -33.081878],
    ],
  ],
};
/**
 * cobertura MCD12Q1 real de 2020 y 2025 en la costa de Rosario, pedida el 2026-11-15 con
 * kmAboveBelow=2 y kmLeftRight=2 alrededor de (-32.9468, -60.6393): 9 x 9 píxeles de 463 m
 */
export const LANDCOVER_ROSARIO_FIXTURE = {
  xllcorner: '-5660291.43',
  yllcorner: '-3665730.25',
  cellsize: 463.312716528,
  nrows: 9,
  ncols: 9,
  band: 'LC_Type1',
  scale: 'Not Available',
  latitude: -32.9468,
  longitude: -60.6393,
  subset: [
    {
      modis_date: 'A2020001',
      calendar_date: '2020-01-01',
      band: 'LC_Type1',
      data: [
        16, 17, 11, 11, 11, 11, 11, 11, 11, 13, 13, 11, 17, 11, 11, 17, 11, 11, 13, 13, 13, 13, 17,
        17, 11, 17, 11, 13, 13, 13, 13, 13, 16, 17, 17, 11, 13, 13, 13, 13, 13, 13, 16, 17, 17, 13,
        13, 13, 13, 13, 13, 13, 13, 17, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,
        13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,
      ],
    },
    {
      modis_date: 'A2025001',
      calendar_date: '2025-01-01',
      band: 'LC_Type1',
      data: [
        16, 17, 11, 11, 11, 11, 11, 11, 11, 13, 13, 11, 17, 11, 11, 17, 10, 10, 13, 13, 13, 13, 17,
        17, 11, 17, 10, 13, 13, 13, 13, 13, 16, 17, 17, 11, 13, 13, 13, 13, 13, 13, 16, 17, 17, 13,
        13, 13, 13, 13, 13, 13, 13, 17, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,
        13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13,
      ],
    },
  ],
};
/**
 * pedidos reales de un solo píxel (kmAboveBelow=0 y kmLeftRight=0, año 2020) en dos lugares de
 * esa grilla que se ven distintos según cómo se lea data: el centro de la fila 0 y columna 4, y
 * el de la fila 4 y columna 7, ubicados leyendo las filas de norte a sur y las columnas de oeste
 * a este. con las filas al revés, el primero caería en la ciudad (13); con las columnas al revés,
 * el segundo también
 */
export const LANDCOVER_ROSARIO_SINGLE_PIXELS = [
  { latitude: -32.93125, longitude: -60.6267, calendar_date: '2020-01-01', data: [11] },
  { latitude: -32.94792, longitude: -60.62324, calendar_date: '2020-01-01', data: [17] },
];

/**
 * clases MCD12Q1 reales de 3 x 3 píxeles del Chaco: filas 7 a 9 y columnas 0 a 2 de la grilla de
 * 21 x 21 pedida el 2026-11-15 con kmAboveBelow=5 y kmLeftRight=5 alrededor de (-26.1234,
 * -62.4321), fila por fila de norte a sur. sabana (9) y sabana arbolada (8) en 2020, y dos
 * píxeles que MODIS vio como cultivo (12) en 2022 y 2023 antes de pasar a pastizal (10)
 */
export const LANDCOVER_CHACO_BLOCK: { year: number; classes: number[] }[] = [
  { year: 2020, classes: [9, 9, 8, 9, 9, 8, 9, 9, 8] },
  { year: 2021, classes: [9, 9, 8, 9, 9, 8, 9, 9, 8] },
  { year: 2022, classes: [10, 9, 8, 12, 9, 8, 12, 9, 8] },
  { year: 2023, classes: [10, 9, 8, 12, 9, 8, 12, 10, 8] },
  { year: 2024, classes: [10, 9, 8, 10, 9, 8, 10, 9, 9] },
  { year: 2025, classes: [9, 9, 8, 10, 9, 8, 10, 9, 8] },
];

/** esquina de arriba a la izquierda de la grilla sinusoidal global de MODIS, en metros */
const MODIS_GRID_ORIGIN = { x: -20015109.354, y: 10007554.677 };

/**
 * grilla como la arma ORNL para una ventana: el píxel que contiene el centro y
 * floor(km * 1000 / lado) píxeles más a cada lado, alineados a la grilla global. coincide al
 * centímetro con los xllcorner e yllcorner reales de los fixtures (ver modis.spec.ts)
 */
export function ornlGrid(window: ModisWindow, cellM = LANDCOVER_CELL_M): SubsetGrid {
  const [x, y] = latLngToSinusoidal(window.center);
  const col = Math.floor((x - MODIS_GRID_ORIGIN.x) / cellM);
  const row = Math.floor((MODIS_GRID_ORIGIN.y - y) / cellM);
  const nx = Math.floor((window.kmEw * 1000) / cellM);
  const ny = Math.floor((window.kmNs * 1000) / cellM);
  return {
    xll: MODIS_GRID_ORIGIN.x + (col - nx) * cellM,
    yll: MODIS_GRID_ORIGIN.y - (row + ny + 1) * cellM,
    cellSizeM: cellM,
    nrows: 2 * ny + 1,
    ncols: 2 * nx + 1,
  };
}

/** lote de ejemplo 1 de Casilda (GET /api/lots/1/), de 23,4 ha */
export const LOT1 = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-61.216504, -33.043694],
      [-61.212117, -33.04019],
      [-61.209065, -33.0429],
      [-61.213452, -33.046404],
      [-61.216504, -33.043694],
    ],
  ],
};
