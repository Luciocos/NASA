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

// Respuestas de la API de lotes y bitácora (Dev B). Ver CLAUDE.md, sección 10.
// Extienden los tipos de arriba sin cambiarlos.

/** Elemento de GET /api/lots/. */
export interface LotSummary extends Lot {
  event_count: number;
}

export interface CampaignDetail extends Campaign {
  crop_label: string;
}

/** GET /api/lots/{id}/. */
export interface LotDetail extends LotSummary {
  campaigns: CampaignDetail[];
}

/** Cuerpo de POST /api/lots/. El área la calcula el backend. */
export interface LotCreate {
  name: string;
  renspa?: string | null;
  locality?: string;
  province?: string;
  geometry: PolygonGeometry;
}

/** Evento tal como lo devuelve la bitácora. Las URL de evidencia son null si no hay imagen. */
export interface EventLogItem extends LotEvent {
  campaign_label: string | null;
  type_label: string;
  sensor_label: string;
  evidence_image_url: string | null;
  evidence_optical_image_url: string | null;
}

/** GET /api/lots/{id}/events/. message explica por qué la lista está vacía (null si no lo está). */
export interface EventLog {
  lot: number;
  count: number;
  message: string | null;
  events: EventLogItem[];
}

/** Filtros de la bitácora. campaign es el id de la campaña o su etiqueta ("2025/26"). */
export interface EventFilters {
  type?: EventType | '';
  sensor?: Sensor | '';
  campaign?: number | string | '';
}

/** Cuerpo de PATCH /api/events/{id}/: confirmar o corregir un evento. */
export interface EventReview {
  confirm?: boolean;
  type?: EventType;
  date?: string;
  date_uncertainty_days?: number | null;
  notes?: string;
}
