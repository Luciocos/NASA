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

// Respuestas de huella, puntaje, simulador y pasaporte (Dev C). Ver CLAUDE.md, secciones 9 y 10.
// Extienden los tipos de arriba sin cambiarlos.

/** Estado de un componente de la huella: "sin_dato" trae siempre el motivo en reason. */
export type FootprintStatus = 'calculado' | 'sin_dato';

/** Nivel de confianza global. SIN DATOS: no hay ningún dato del lote para evaluar. */
export type ConfidenceLevel = 'ALTO' | 'BAJO' | 'SIN DATOS';

export interface ConfidenceSummary {
  level: ConfidenceLevel;
  counts: Record<Origin, number>;
  total: number;
  rule: string;
}

export interface FootprintActivity {
  quantity: number | null;
  unit: string | null;
  /** Origen menos respaldado de los registros (el más respaldado, para cambio de uso). */
  origin: Origin | null;
  origins: Origin[];
  records: number;
  /** Solo en cambio de uso: true detectado, false no detectado, null no se sabe. */
  detected?: boolean | null;
}

export interface EmissionFactor {
  key: string;
  value?: number | null;
  unit?: string | null;
  source?: string | null;
  validated?: boolean;
}

export interface FootprintComponent {
  key: string;
  label: string;
  status: FootprintStatus;
  reason: string | null;
  note: string | null;
  activity: FootprintActivity;
  factor: EmissionFactor;
  kg_co2e_per_ha: number | null;
  kg_co2e_per_t: number | null;
  is_simulated: boolean;
  hypothetical: boolean;
}

export interface FootprintYield {
  value: number | null;
  unit: string;
  origin: Origin | null;
  status: FootprintStatus;
  reason: string | null;
}

export interface CampaignRef {
  id: number | null;
  label: string;
}

/** GET /api/lots/{id}/footprint/?campaign=. El total es null mientras falte algún dato. */
export interface Footprint {
  lot: number;
  campaign: (CampaignRef & { crop: Crop; crop_origin: Origin }) | null;
  available_campaigns: CampaignRef[];
  provisional: boolean;
  disclaimer: string;
  unit: string;
  complete: boolean;
  total_kg_co2e_per_t: number | null;
  message: string | null;
  missing_components: string[];
  yield: FootprintYield;
  components: FootprintComponent[];
  confidence: ConfidenceSummary;
  uses_simulated_data: boolean;
}

export type CriterionStatus = 'cumple' | 'no_cumple' | 'sin_dato';

export interface CriterionEvidence {
  type: EventType;
  date: string;
  origin: Origin;
  is_simulated: boolean;
  hypothetical: boolean;
}

export interface ScoreCriterion {
  key: string;
  label: string;
  status: CriterionStatus;
  status_label: string;
  origin: Origin | null;
  reason: string;
  evidence: CriterionEvidence[];
  is_simulated: boolean;
  hypothetical: boolean;
  weight: number | null;
}

/** GET /api/lots/{id}/score/. score es null mientras los pesos no estén definidos. */
export interface SustainabilityScore {
  lot: number;
  provisional: boolean;
  disclaimer: string;
  score: number | null;
  max_score: number;
  weights_defined: boolean;
  message: string | null;
  criteria: ScoreCriterion[];
  missing_criteria: string[];
  confidence: ConfidenceSummary;
  uses_simulated_data: boolean;
}

/** Cuerpo de POST /api/lots/{id}/simulate/. */
export interface SimulationRequest {
  cover_crop?: boolean;
  campaign?: number | string;
}

export interface SimulationSnapshot {
  footprint: Footprint;
  score: SustainabilityScore;
}

export interface CriterionChange {
  key: string;
  label: string;
  before: CriterionStatus;
  after: CriterionStatus;
}

/** POST /api/lots/{id}/simulate/. persisted es siempre false: no se guarda nada. */
export interface SimulationResult {
  lot: number;
  changes: SimulationRequest;
  persisted: false;
  message: string;
  notes: string[];
  changed_criteria: CriterionChange[];
  before: SimulationSnapshot;
  after: SimulationSnapshot;
}

/** POST /api/lots/{id}/passport/. url es la ruta del frontend: /pasaporte/<token>. */
export interface PassportLink {
  token: string;
  lot: number;
  url: string;
  created_at: string;
  expires_at: string | null;
}

/** GET /api/passports/{token}/. Un pasaporte vencido responde 410. */
export interface PublicPassport {
  token: string;
  generated_at: string;
  created_at: string;
  expires_at: string | null;
  lot: LotDetail;
  events: EventLogItem[];
  footprint: Footprint;
  score: SustainabilityScore;
  uses_simulated_data: boolean;
  disclaimer: string;
  data_notice: string;
}
