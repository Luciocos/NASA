/** Forma de `details` del chequeo 'periurban'. Ver backend/territory/checks/periurban.py. */
export interface PeriurbanBand {
  key: 'terrestrial' | 'aerial';
  label: string;
  buffer_m: number;
  overlap_ha: number;
  overlap_pct: number;
}

export interface PeriurbanGeometry {
  urban: GeoJSON.Geometry | null;
  terrestrial: GeoJSON.Geometry | null;
  aerial: GeoJSON.Geometry | null;
}

export interface PeriurbanNorm {
  name: string;
  date: string;
  url: string;
  article_terrestrial: string;
  article_aerial: string;
  municipal_ordinance: string | null;
}

export interface PeriurbanDetails {
  locality: string;
  province?: string;
  distance_to_urban_m: number;
  terrestrial_buffer_m?: number;
  aerial_buffer_m?: number;
  lot_area_ha?: number;
  bands?: PeriurbanBand[];
  localities?: { locality: string; distance_to_urban_m: number }[];
  norm?: PeriurbanNorm;
  urban_boundary_note?: string;
  geometry?: PeriurbanGeometry;
}
