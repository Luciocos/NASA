import { PolygonGeometry } from '../../core/models';

/** geometría GeoJSON tal cual la arma el backend (polígonos y líneas) */
export interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString';
  coordinates: unknown;
}

export interface LineFeature {
  type: 'Feature';
  geometry: GeoJsonGeometry;
  properties: {
    length_m: number;
    upstream_ha?: number | null;
    waterway?: string | null;
    name?: string | null;
    culvert?: boolean;
  };
}

export interface FlowPoint {
  kind: 'entry' | 'exit';
  lat: number;
  lng: number;
  upstream_ha: number;
}

export interface Outlet {
  lat: number;
  lng: number;
  elevation_m: number | null;
}

export interface LandCoverShare {
  igbp: number;
  label: string;
  area_ha: number;
  share: number;
}

export interface Basin {
  area_ha: number;
  outside_lot_ha: number;
  lot_share: number;
  subbasins: number;
  mean_slope_pct: number;
  relief_m: number;
  elevation_range_m: [number, number];
  hydraulic_length_m: number;
  stream_length_m: number;
  osm_length_m: number;
  touches_window_edge: boolean;
  dem_only_area_ha: number;
  geometry: GeoJsonGeometry;
  land_cover: LandCoverShare[];
  cn_arc_ii: number;
}

export interface Contributing {
  area_ha: number;
  lot_ha: number;
  outside_lot_ha: number;
  touches_window_edge: boolean;
  geometry: GeoJsonGeometry;
}

export interface Subbasin {
  id: number;
  area_ha: number;
  geometry: GeoJsonGeometry;
}

export interface InspectionSector {
  lat: number;
  lng: number;
  area_ha: number;
  max_upstream_ha: number;
  depression_m: number;
  reason: string;
  geometry: GeoJsonGeometry;
}

export interface SoilPoint {
  lat: number;
  lon: number;
  sand: number;
  silt: number;
  clay: number;
  texture: string;
  hsg: string | null;
}

export interface WaterAnalysis {
  available: true;
  lot: number;
  configured_for: string;
  outlet: Outlet;
  basin: Basin;
  contributing: Contributing;
  subbasins: Subbasin[];
  streams: { type: 'FeatureCollection'; features: LineFeature[] };
  osm_waterways: { type: 'FeatureCollection'; features: LineFeature[] };
  entries: FlowPoint[];
  exits: FlowPoint[];
  subbasin_threshold_ha: number;
  /** [lat, lng, lat aguas abajo, lng aguas abajo] de una muestra de celdas D8 */
  flow_arrows: [number, number, number, number][];
  inspection: { sectors: InspectionSector[]; method: string; limitation: string };
  layers: {
    bounds: [[number, number], [number, number]];
    flow_accumulation: string;
    twi: string;
    depressions: string;
  };
  soil: {
    hsg: string | null;
    hsg_counts: Record<string, number>;
    points: SoilPoint[];
    source: string;
    method: string;
    limitation: string;
  };
  parameters: {
    terrain: Record<string, number | string>;
    methods: Record<string, string>;
    cover_assumption: string;
    curve_number_source: string;
  };
  sources: {
    dem: { name: string; provider: string; note: string };
    osm: { name: string; count: number; downloaded: string };
    land_cover: { product: string; year: string; pixel_m: number } | null;
    generated_at: string;
  };
  limitations: string[];
}

export type Arc = 'I' | 'II' | 'III';
export type Hsg = 'A' | 'B' | 'C' | 'D';

export interface FlowRange {
  runoff_mm: number;
  volume_m3: number;
  peak_m3s: number;
}

export interface Hydrograph {
  times_h: number[];
  flow_m3s: number[];
}

export interface ModelResult {
  rain_mm: number;
  runoff_mm: number;
  runoff_coefficient: number | null;
  volume_m3: number;
  peak_m3s: number;
  time_to_peak_h: number;
  lag_h: number;
  cn_arc_ii: number;
  arc: Arc;
  hsg: Hsg;
  step_h: number;
  hydrograph: Hydrograph;
  hyetograph_mm: number[];
  notes: string[];
}

export interface SimulationRequest {
  rain_mm: number;
  duration_h: number;
  arc: Arc;
  hsg?: Hsg;
  residue: boolean;
  lat?: number;
  lng?: number;
}

export interface WaterSimulation {
  available: true;
  scenario: {
    rain_mm: number;
    duration_h: number;
    distribution: string;
    arc: Arc;
    hsg: Hsg;
    residue: boolean;
    kind: string;
  };
  outlet: Outlet;
  basin_area_ha: number;
  result: ModelResult;
  range: Record<Arc, FlowRange>;
  method: string;
  disclaimer: string;
}

export interface SmapReading {
  date: string;
  m3_m3: number;
  cell_center: [number, number];
  product: string;
}

export interface RainEvent {
  start: string;
  end: string;
  run: 'Final' | 'Late';
  rain_mm: number;
  max_intensity_mm_h: number | null;
  duration_h: number;
  missing_steps: number;
  antecedent_5d_mm: number | null;
  smap: SmapReading | null;
  et_before: { start: string; et_mm_8d: number; product: string } | null;
  runoff_mm: number;
  volume_m3: number;
  peak_m3s: number;
  time_to_peak_h: number;
  range: Record<Arc, FlowRange>;
  hyetograph_mm: number[];
  step_h: number;
  hydrograph: Hydrograph;
}

export interface WaterHistory {
  available: true;
  lot: number;
  outlet: Outlet;
  basin_area_ha: number;
  hsg: Hsg;
  events: RainEvent[];
  monthly_rain: { month: string; mm: number }[];
  selection: string;
  sources: { rain: string; soil_moisture: string; et: string; generated_at: string };
  method: string;
  validation: string;
}

export interface WaterUnavailable {
  available: false;
  detail: string;
}

/** el polígono del lote, para el mapa */
export type LotGeometry = PolygonGeometry;
