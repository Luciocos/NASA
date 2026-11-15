import { HttpErrorResponse } from '@angular/common/http';

import { isConnectivityError } from '../../core/offline/http-errors';

export type AuthField = 'name' | 'email' | 'password';

/** lo que se muestra en el formulario: un mensaje por campo y uno general */
export interface AuthFormErrors {
  fields: Partial<Record<AuthField, string>>;
  message: string | null;
}

export const NO_ERRORS: AuthFormErrors = { fields: {}, message: null };

/** orden de los campos en pantalla: el primero con error recibe el foco */
export const FIELD_ORDER: readonly AuthField[] = ['name', 'email', 'password'];

const OFFLINE_MESSAGE = 'No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo.';
const THROTTLED_MESSAGE = 'Hiciste muchos intentos seguidos. Esperá un minuto y probá de nuevo.';

/** el error del mail, o null si está bien escrito */
export function emailError(value: string): string | null {
  const email = value.trim();
  if (!email) return 'Escribí tu mail.';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? null
    : 'Revisá el mail: tiene que ser como nombre@ejemplo.com.';
}

export function hasErrors(errors: AuthFormErrors): boolean {
  return errors.message !== null || Object.keys(errors.fields).length > 0;
}

/**
 * la respuesta de error del backend, lista para el formulario. con un 400 trae los mensajes de
 * django por campo (`{ email: [...] }`) o uno general (`{ detail }`); con un 429, el aviso del
 * límite de intentos. `action` completa el mensaje genérico: "No se pudo <action>…"
 */
export function authFormErrors(error: unknown, action: string): AuthFormErrors {
  if (isConnectivityError(error)) return { fields: {}, message: OFFLINE_MESSAGE };
  if (!(error instanceof HttpErrorResponse)) {
    return { fields: {}, message: `No se pudo ${action}. Probá de nuevo.` };
  }
  if (error.status !== 400 && error.status !== 429) {
    return {
      fields: {},
      message: `No se pudo ${action} (error ${error.status}). Probá de nuevo en un rato.`,
    };
  }
  const fields: AuthFormErrors['fields'] = {};
  const general: string[] = [];
  const body: unknown = error.error;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [key, value] of Object.entries(body)) {
      const text = messagesOf(value).join(' ');
      if (!text) continue;
      if ((FIELD_ORDER as readonly string[]).includes(key)) fields[key as AuthField] = text;
      else general.push(text);
    }
  } else {
    general.push(...messagesOf(body));
  }
  if (error.status === 429 && general.length === 0) general.push(THROTTLED_MESSAGE);
  const message =
    general.join(' ') ||
    (Object.keys(fields).length > 0 ? null : `No se pudo ${action}. Probá de nuevo.`);
  return { fields, message };
}

function messagesOf(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(messagesOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(messagesOf);
  return [];
}
