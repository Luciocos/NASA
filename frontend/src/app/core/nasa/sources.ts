import type { DataSourceInfo } from './models';

export type NasaSourceId =
  'power' | 'modisNdvi' | 'modisLandCover' | 'modisLandUse' | 'nisar' | 'hls' | 'gibs';

/** de dónde sale cada dato, con su resolución real y sus límites */
export const DATA_SOURCES: Record<NasaSourceId, DataSourceInfo> = {
  power: {
    name: 'NASA POWER',
    product: 'POWER Daily API, AG community (MERRA-2 and GEOS-IT)',
    resolution: 'grid of about 50 km',
    cadence: 'daily, a few days behind',
    origin: 'ESTIMATED',
    note: 'It is a reanalysis model on a grid of about 50 km: it describes the area, not your field. The last few days often come in with no data.',
  },
  modisNdvi: {
    name: 'MODIS Terra (ORNL DAAC)',
    product: 'MOD13Q1 v6.1, 16-day NDVI with per-pixel reliability',
    resolution: '250 m (231.66 m per side)',
    cadence: 'a composite every 16 days, published about 2 or 3 weeks later',
    origin: 'VERIFIED',
    note: 'A 250 m pixel covers more than 6 ha and can mix in neighboring fields, roads or woodland. Cloudy pixels and pixels with no data are discarded.',
  },
  modisLandCover: {
    name: 'MODIS Terra and Aqua (ORNL DAAC)',
    product: 'MCD12Q1 v6.1, IGBP classification (LC_Type1)',
    resolution: '500 m',
    cadence: 'yearly',
    origin: 'VERIFIED',
    note: 'It is an automatic classification of a 500 m pixel at the center of the field: useful to see changes in land use, not to identify the crop.',
  },
  modisLandUse: {
    name: 'MODIS Terra and Aqua (ORNL DAAC)',
    product: 'MCD12Q1 v6.1, IGBP classification (LC_Type1) of the pixels covering the field',
    resolution: '500 m (463.31 m per side, about 21 ha per pixel)',
    cadence: 'yearly; each year’s map is published during the following year',
    origin: 'VERIFIED',
    note: 'It is a guide only: each pixel covers about 21 ha and mixes your field with its surroundings, so it shows large changes, like land clearing or a wetland turned into cropland, and not small ones. Cropland and cropland/natural vegetation mosaic both count as agricultural use, because the classification jumps between the two without anything changing.',
  },
  nisar: {
    name: 'NISAR (Earthdata CMR catalog)',
    product: 'NISAR L2 GCOV, L-band radar',
    resolution: 'scene of about 240 km, 20 m pixel',
    cadence: 'every 12 days per orbit',
    origin: 'VERIFIED',
    note: 'Lists the passes that cross the field. Radar sees through clouds. Provisional scenes may change once they are validated.',
  },
  hls: {
    name: 'HLS (Earthdata CMR catalog)',
    product: 'HLSS30 and HLSL30 v2.0, harmonized Sentinel-2 and Landsat',
    resolution: '30 m',
    cadence: 'every 2 or 3 days, combining satellites',
    origin: 'VERIFIED',
    note: 'The reported cloud cover is for the whole scene of about 110 km, not for your field.',
  },
  gibs: {
    name: 'NASA GIBS',
    product: 'WMTS tiles by date (HLS, MODIS, SMAP, OPERA)',
    resolution: 'depends on the layer, from 30 m to 9 km',
    cadence: 'depends on the layer',
    origin: 'VERIFIED',
    note: 'These are images to look at, not measured values: the colors are not turned into numbers.',
  },
};

/** clases IGBP de MCD12Q1 (LC_Type1) */
export const IGBP_LABELS: Record<number, string> = {
  1: 'Evergreen needleleaf forest',
  2: 'Evergreen broadleaf forest',
  3: 'Deciduous needleleaf forest',
  4: 'Deciduous broadleaf forest',
  5: 'Mixed forest',
  6: 'Closed shrubland',
  7: 'Open shrubland',
  8: 'Woody savanna',
  9: 'Savanna',
  10: 'Grassland',
  11: 'Permanent wetland',
  12: 'Cropland',
  13: 'Urban area',
  14: 'Cropland and natural vegetation mosaic',
  15: 'Permanent snow and ice',
  16: 'Barren or sparse vegetation',
  17: 'Water',
};

/** motivos para acompañar un "Sin dato" */
export const NO_DATA_REASONS = {
  noResponse: 'No response from the NASA service. Try again in a few minutes.',
  slow: 'The NASA service is taking longer than usual. Try again in a few minutes.',
  offline: 'Offline, and there is no copy saved on this device.',
  cloudy: 'The composite came back cloudy over the field.',
  noPixel: 'The satellite has no valid value for that period.',
  powerLag: 'NASA POWER publishes the last few days with a delay.',
  notYet: 'No composite has been published for that date yet.',
} as const;
