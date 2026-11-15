import type { NasaHttp } from './http';
import type { DateRange, GibsLayer, SatelliteScene, SceneList } from './models';

export const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const ATTRIBUTION = 'NASA EOSDIS GIBS';

const layer = (
  id: string,
  title: string,
  description: string,
  ext: 'png' | 'jpg',
  level: number,
  kind: 'base' | 'overlay',
  origin: GibsLayer['origin'] = 'VERIFIED',
): GibsLayer => ({
  id,
  title,
  description,
  ext,
  tileMatrixSet: `GoogleMapsCompatible_Level${level}`,
  maxNativeZoom: level,
  attribution: ATTRIBUTION,
  kind,
  origin,
});

/** capas verificadas; el número del tileMatrixSet es el zoom nativo máximo */
export const GIBS_LAYERS: GibsLayer[] = [
  layer(
    'HLS_S30_Nadir_BRDF_Adjusted_Reflectance',
    'Color real HLS Sentinel-2',
    'Imagen de 30 m del día de la pasada. Si está nublado, se ven las nubes.',
    'png',
    12,
    'base',
  ),
  layer(
    'HLS_L30_Nadir_BRDF_Adjusted_Reflectance',
    'Color real HLS Landsat',
    'Imagen de 30 m del día de la pasada de Landsat.',
    'png',
    12,
    'base',
  ),
  layer(
    'MODIS_Terra_CorrectedReflectance_TrueColor',
    'Color real MODIS Terra',
    'Imagen diaria de 250 m: sirve para ver nubes y anegamientos grandes.',
    'jpg',
    9,
    'base',
  ),
  layer(
    'MODIS_Terra_NDVI_8Day',
    'NDVI MODIS de 8 días',
    'Verdor de la vegetación en píxeles de 250 m; solo para mirar, los colores no son valores.',
    'png',
    9,
    'overlay',
  ),
  layer(
    'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',
    'Humedad en la zona de raíces SMAP L4',
    'Modelo que asimila el satélite SMAP, en celdas de 9 km.',
    'png',
    6,
    'overlay',
    'ESTIMATED',
  ),
  layer(
    'OPERA_L3_DIST-ALERT-HLS_Color_Index',
    'Alertas de disturbio OPERA',
    'Pérdida de vegetación detectada sobre HLS, a 30 m.',
    'png',
    12,
    'overlay',
  ),
  layer(
    'OPERA_L3_Dynamic_Surface_Water_Extent-HLS',
    'Agua en superficie OPERA',
    'Agua detectada sobre HLS, a 30 m.',
    'png',
    12,
    'overlay',
  ),
];

function find(layerOrId: GibsLayer | string): GibsLayer {
  if (typeof layerOrId !== 'string') return layerOrId;
  const found = GIBS_LAYERS.find((l) => l.id === layerOrId);
  if (!found) throw new Error(`capa GIBS desconocida: ${layerOrId}`);
  return found;
}

/** rangos "inicio/fin/P1D" (o fechas sueltas) de la etiqueta Domain */
export function parseGibsDomain(xml: string): DateRange[] {
  const domain = /<Domain>([^<]*)<\/Domain>/.exec(xml)?.[1] ?? '';
  return domain
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [start, end] = part.split('/');
      return { start: start.slice(0, 10), end: (end ?? start).slice(0, 10) };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** la última fecha publicada que no pasa de la dada (o la última de todas) */
export function nearestAvailable(ranges: DateRange[], iso?: string): string | null {
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    if (!iso || iso >= r.end) return r.end;
    if (iso >= r.start) return iso.slice(0, 10);
  }
  return null;
}

/** teselas WMTS de GIBS para Leaflet */
export class GibsCatalog {
  readonly layers = GIBS_LAYERS;

  constructor(private readonly http: NasaHttp) {}

  /** plantilla para L.tileLayer, con {z}/{y}/{x}; usar una fecha real (la "default" de HLS viene vacía) */
  tileUrl(layerOrId: GibsLayer | string, date: string): string {
    const l = find(layerOrId);
    return `${GIBS_BASE}/${l.id}/default/${date.slice(0, 10)}/${l.tileMatrixSet}/{z}/{y}/{x}.${l.ext}`;
  }

  /** rangos de fechas publicadas de una capa (copia de 6 h) */
  async availableDates(
    layerOrId: GibsLayer | string,
  ): Promise<{ data: DateRange[]; stale: boolean; savedAt: string }> {
    const l = find(layerOrId);
    const res = await this.http.get<string>({
      url: `${GIBS_BASE}/1.0.0/${l.id}/default/${l.tileMatrixSet}/all/all.xml`,
      service: 'gibs',
      maxAgeMs: 6 * 3_600_000,
      as: 'text',
    });
    return { data: parseGibsDomain(res.body), stale: res.stale, savedAt: res.savedAt };
  }
}

/** capa GIBS de color real que corresponde a una escena HLS */
export function hlsLayerFor(scene: SatelliteScene): string | null {
  if (scene.mission !== 'HLS') return null;
  return scene.title.includes('.L30.')
    ? 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance'
    : 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance';
}

/** la escena HLS más reciente con poca nubosidad (de toda la escena, no del lote) */
export function bestHlsScene(list: SceneList, maxCloud = 30): SatelliteScene | null {
  return (
    list.items
      .filter((s) => s.mission === 'HLS' && s.cloudCover !== null && s.cloudCover <= maxCloud)
      .sort((a, b) => b.start.localeCompare(a.start))[0] ?? null
  );
}
