// Tipos compartidos con el backend. Ver CLAUDE.md, sección 7.
// Es código común: cambiarlo solo con acuerdo del equipo.

export type Origin = 'VERIFIED' | 'DECLARED' | 'ESTIMATED';

export const ORIGIN_LABELS: Record<Origin, string> = {
  VERIFIED: 'Verificado',
  DECLARED: 'Declarado',
  ESTIMATED: 'Estimado',
};

export interface Health {
  status: string;
  database: string;
}
