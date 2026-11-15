import type { DataSourceInfo } from './models';

export type NasaSourceId = 'power' | 'modisNdvi' | 'modisLandCover' | 'nisar' | 'hls' | 'gibs';

/** de dónde sale cada dato, con su resolución real y sus límites */
export const DATA_SOURCES: Record<NasaSourceId, DataSourceInfo> = {
  power: {
    name: 'NASA POWER',
    product: 'POWER Daily API, comunidad AG (MERRA-2 y GEOS-IT)',
    resolution: 'grilla de unos 50 km',
    cadence: 'diaria, con unos días de demora',
    origin: 'ESTIMATED',
    note: 'Es un modelo de reanálisis en una grilla de unos 50 km: describe la zona, no tu lote. Los últimos días suelen llegar sin dato.',
  },
  modisNdvi: {
    name: 'MODIS Terra (ORNL DAAC)',
    product: 'MOD13Q1 v6.1, NDVI de 16 días con confiabilidad por píxel',
    resolution: '250 m (231,66 m de lado)',
    cadence: 'compuesto cada 16 días, publicado unas 2 o 3 semanas después',
    origin: 'VERIFIED',
    note: 'Un píxel de 250 m mide más de 6 ha y puede mezclar lotes vecinos, caminos o montes. Los píxeles nublados o sin dato se descartan.',
  },
  modisLandCover: {
    name: 'MODIS Terra y Aqua (ORNL DAAC)',
    product: 'MCD12Q1 v6.1, clasificación IGBP (LC_Type1)',
    resolution: '500 m',
    cadence: 'anual',
    origin: 'VERIFIED',
    note: 'Es una clasificación automática de un píxel de 500 m en el centro del lote: sirve para ver cambios de uso, no para identificar el cultivo.',
  },
  nisar: {
    name: 'NISAR (catálogo CMR de Earthdata)',
    product: 'NISAR L2 GCOV, radar de banda L',
    resolution: 'escena de unos 240 km, píxel de 20 m',
    cadence: 'cada 12 días por órbita',
    origin: 'VERIFIED',
    note: 'Se listan las pasadas que cruzan el lote. El radar ve a través de las nubes. Las escenas provisionales pueden cambiar cuando se validen.',
  },
  hls: {
    name: 'HLS (catálogo CMR de Earthdata)',
    product: 'HLSS30 y HLSL30 v2.0, Sentinel-2 y Landsat armonizados',
    resolution: '30 m',
    cadence: 'cada 2 o 3 días combinando satélites',
    origin: 'VERIFIED',
    note: 'La nubosidad informada es la de toda la escena de unos 110 km, no la de tu lote.',
  },
  gibs: {
    name: 'NASA GIBS',
    product: 'Teselas WMTS por fecha (HLS, MODIS, SMAP, OPERA)',
    resolution: 'según la capa, de 30 m a 9 km',
    cadence: 'según la capa',
    origin: 'VERIFIED',
    note: 'Son imágenes para mirar, no valores medidos: los colores no se convierten en números.',
  },
};

/** clases IGBP de MCD12Q1 (LC_Type1) */
export const IGBP_LABELS: Record<number, string> = {
  1: 'Bosque perennifolio de coníferas',
  2: 'Bosque perennifolio de latifoliadas',
  3: 'Bosque caducifolio de coníferas',
  4: 'Bosque caducifolio de latifoliadas',
  5: 'Bosque mixto',
  6: 'Matorral cerrado',
  7: 'Matorral abierto',
  8: 'Sabana arbolada',
  9: 'Sabana',
  10: 'Pastizal',
  11: 'Humedal permanente',
  12: 'Cultivo agrícola',
  13: 'Área urbana',
  14: 'Mosaico de cultivo y vegetación natural',
  15: 'Nieve o hielo permanente',
  16: 'Suelo desnudo o vegetación escasa',
  17: 'Agua',
};

/** motivos para acompañar un "Sin dato" */
export const NO_DATA_REASONS = {
  noResponse: 'Sin respuesta del servicio de la NASA. Probá de nuevo en unos minutos.',
  offline: 'Sin conexión y sin una copia guardada en este dispositivo.',
  cloudy: 'El compuesto vino nublado sobre el lote.',
  noPixel: 'El satélite no tiene un valor válido para ese período.',
  powerLag: 'NASA POWER publica los últimos días con demora.',
  notYet: 'Todavía no hay un compuesto publicado para esa fecha.',
} as const;
