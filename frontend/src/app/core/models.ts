// Tipos compartidos con el backend. Ver CLAUDE.md, sección 7.
// Es código común: cambiarlo solo con acuerdo del equipo.

export type Origin = 'VERIFIED' | 'DECLARED' | 'ESTIMATED';

export const ORIGIN_LABELS: Record<Origin, string> = {
  VERIFIED: 'Verificado',
  DECLARED: 'Declarado',
  ESTIMATED: 'Estimado',
};

export type Crop = 'SOY' | 'CORN' | 'WHEAT' | 'OTHER';

export type EventType =
  'SOWING' | 'HARVEST' | 'TILLAGE' | 'COVER_CROP' | 'FLOODING' | 'BURN' | 'LAND_USE_CHANGE';

export type Sensor =
  'NISAR' | 'SENTINEL1' | 'HLS' | 'LANDSAT' | 'MODIS' | 'VIIRS' | 'SMAP' | 'MANUAL';

export type InputCategory =
  'FERTILIZER_N' | 'FERTILIZER_P' | 'FERTILIZER_OTHER' | 'PESTICIDE' | 'DIESEL' | 'SEED';

/** GeoJSON Polygon en EPSG:4326: anillos de pares [longitud, latitud]. */
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface Lot {
  id: number;
  name: string;
  renspa: string;
  locality: string;
  province: string;
  geometry: PolygonGeometry;
  area_ha: number;
  created_at: string;
}

export interface Campaign {
  id: number;
  lot: number;
  label: string;
  crop: Crop;
  crop_origin: Origin;
  yield_t_ha: number | null;
  yield_origin: Origin | '';
}

export interface LotEvent {
  id: number;
  lot: number;
  campaign: number | null;
  type: EventType;
  date: string;
  date_uncertainty_days: number | null;
  sensor: Sensor;
  origin: Origin;
  confidence: number | null;
  evidence_image: string;
  evidence_optical_image: string;
  metrics: Record<string, unknown>;
  is_simulated: boolean;
  notes: string;
}

export interface InputRecord {
  id: number;
  campaign: number;
  category: InputCategory;
  quantity: number;
  unit: string;
  origin: Origin;
  is_simulated: boolean;
}

export interface Health {
  status: string;
  database: string;
}
