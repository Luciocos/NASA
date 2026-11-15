/** Cuerpo de POST /api/lots/{id}/bpa/. adheres null borra la declaración. */
export interface BpaDeclarationRequest {
  adheres: boolean | null;
  registration_number?: string;
}

/** details del chequeo 'bpa' cuando hay declaración (vacío si no la hay). */
export interface BpaDetails {
  adheres?: boolean;
  registration_number?: string;
  program?: string;
  /** ISO 8601 con zona horaria */
  declared_at?: string;
}

/** Opción del formulario: 'unset' es "Sin declarar" (manda null). */
export type BpaChoice = 'yes' | 'no' | 'unset';
