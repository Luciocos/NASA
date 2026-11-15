/** Respuesta de GET /api/lots/{id}/territorial-checks/. Ver backend/territory/result.py. */
export type CheckStatus = 'CLEAR' | 'POSSIBLE_CONFLICT' | 'NO_DATA';
export type CheckOrigin = 'OFFICIAL_LAYER' | 'DECLARED' | 'VERIFIED';
export type CheckKey = 'periurban' | 'otbn' | 'bpa';

export interface LayerSource {
  name: string;
  publisher: string;
  url: string;
  date: string;
  license: string;
}

export interface TerritorialCheck {
  key: CheckKey;
  title: string;
  status: CheckStatus;
  summary: string;
  origin: CheckOrigin;
  sources: LayerSource[];
  /** Datos propios de cada chequeo; cada componente de detalle define su forma. */
  details: Record<string, unknown>;
}

export interface TerritorialChecks {
  lot: number;
  disclaimer: string;
  checks: TerritorialCheck[];
}

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  CLEAR: 'No conflict detected',
  POSSIBLE_CONFLICT: 'Possible conflict',
  NO_DATA: 'No data',
};

export const CHECK_ORIGIN_LABELS: Record<CheckOrigin, string> = {
  OFFICIAL_LAYER: 'Public layer',
  DECLARED: 'Declared',
  VERIFIED: 'Verified',
};
