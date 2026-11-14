import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';

// 0: el pedido no salió o la respuesta no volvió
// 502 y 503: el worker de cloudflare (o el proxy de ng serve) no pudo hablar con django
// 504: lo que devuelve el service worker de angular cuando falla la red
const CONNECTIVITY_STATUSES: ReadonlySet<number> = new Set([0, 502, 503, 504]);

/**
 * true si el error significa "no se llegó al backend": sin red, backend caído o pedido vencido
 * un 400 o un 404 no entran acá: ahí el backend sí respondió
 */
export function isConnectivityError(error: unknown): boolean {
  return (
    error instanceof TimeoutError ||
    (error instanceof HttpErrorResponse && CONNECTIVITY_STATUSES.has(error.status))
  );
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  renspa: 'RENSPA',
  locality: 'Localidad',
  province: 'Provincia',
};

// claves cuyo mensaje ya se entiende solo, sin anteponer el campo
const UNLABELED_FIELDS: ReadonlySet<string> = new Set([
  'detail',
  'non_field_errors',
  'geometry',
  'error',
]);

/**
 * mensaje del backend listo para mostrar, o null si la respuesta no trae ninguno
 * entiende el formato de django rest framework: `{ campo: [mensajes] }` y `{ detail }`
 */
export function describeBackendError(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body: unknown = error.error;
  if (!body || typeof body !== 'object') return null;
  if (Array.isArray(body)) return messagesOf(body).join(' ') || null;
  const parts: string[] = [];
  for (const [field, value] of Object.entries(body)) {
    const text = messagesOf(value).join(' ');
    if (!text) continue;
    const label = UNLABELED_FIELDS.has(field) ? null : (FIELD_LABELS[field] ?? field);
    parts.push(label ? `${label}: ${text}` : text);
  }
  return parts.join(' ') || null;
}

function messagesOf(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(messagesOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(messagesOf);
  return [];
}
