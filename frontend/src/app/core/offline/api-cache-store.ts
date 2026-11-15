import { Service, inject } from '@angular/core';

import { AuthSession, scopedKey } from '../auth/auth-session';
import { OFFLINE_STORAGE } from './storage';

// cada copia va a nombre de quien la pidió: lotestigo:<u<id> | anon>:cache:v1:<url>
const ENTRY_NAME = 'cache:v1:';
const ENTRY_KEY = /^lotestigo:[^:]+:cache:v1:/;

/** tope de respuestas guardadas: al pasarlo se borran las más viejas */
export const API_CACHE_MAX_ENTRIES = 200;

// al pasar el tope se baja hasta acá, así no hay que revisar todo en cada escritura
const TRIM_TO = Math.floor(API_CACHE_MAX_ENTRIES * 0.9);

/** una respuesta del backend guardada en el dispositivo */
export interface CachedResponse<T = unknown> {
  body: T;
  /** cuándo llegó esta respuesta de la red */
  savedAt: Date;
}

/**
 * copia local de las respuestas GET del backend, para mostrarlas cuando no hay conexión
 * la llena y la lee `apiCacheInterceptor`: las pantallas no necesitan usarla, les alcanza con `Api`
 *
 * cada copia queda a nombre de quien la pidió (`u<id>`, o `anon` sin sesión, que solo recibe
 * respuestas públicas): nadie lee las de otro usuario y al salir se borran las suyas
 * (`AuthSession.end`). nunca tira: si el almacenamiento falta o está lleno, simplemente no guarda
 */
@Service()
export class ApiCacheStore {
  private readonly storage = inject(OFFLINE_STORAGE);
  private readonly session = inject(AuthSession);

  /** a nombre de quién se lee y se guarda ahora: el usuario que ingresó o `anon` */
  scope(): string {
    return this.session.scope();
  }

  /** cantidad de respuestas guardadas en el dispositivo, de todos sus usuarios */
  get size(): number {
    return this.keys().length;
  }

  /** la copia guardada de una url (con sus parámetros), o null si no hay */
  get<T = unknown>(url: string, scope: string = this.scope()): CachedResponse<T> | null {
    const key = entryKey(scope, url);
    try {
      const raw = this.storage.getItem(key);
      if (raw === null) return null;
      const entry: unknown = JSON.parse(raw);
      if (isEntry(entry)) return { body: entry.b as T, savedAt: new Date(entry.t) };
    } catch {
      // una entrada rota vale lo mismo que no tener copia
    }
    this.remove(key);
    return null;
  }

  /** guarda la respuesta de una url. devuelve false si no se pudo guardar */
  set(
    url: string,
    body: unknown,
    savedAt: Date = new Date(),
    scope: string = this.scope(),
  ): boolean {
    const key = entryKey(scope, url);
    let value: string;
    try {
      // la fecha va primero para poder leerla sin interpretar todo el cuerpo
      value = `{"t":${savedAt.getTime()},"b":${JSON.stringify(body) ?? 'null'}}`;
    } catch {
      return false;
    }
    // almacenamiento lleno: se borra lo más viejo y se prueba una sola vez más
    if (!this.write(key, value) && !(this.makeRoom(url, scope) && this.write(key, value))) {
      return false;
    }
    this.trim(key);
    return true;
  }

  /** borra la copia de una url */
  delete(url: string, scope: string = this.scope()): void {
    this.remove(entryKey(scope, url));
  }

  /** borra todas las copias, de todos los usuarios del dispositivo */
  clear(): void {
    for (const key of this.keys()) this.remove(key);
  }

  /**
   * libera espacio borrando la mitad más vieja de las copias, de cualquier usuario (sin tocar
   * la de `keepUrl` a nombre de `scope`). devuelve false si no había nada para borrar
   */
  makeRoom(keepUrl?: string, scope: string = this.scope()): boolean {
    const candidates = this.oldestFirst(keepUrl === undefined ? null : entryKey(scope, keepUrl));
    const victims = candidates.slice(0, Math.ceil(candidates.length / 2));
    for (const key of victims) this.remove(key);
    return victims.length > 0;
  }

  private trim(justWritten: string): void {
    const excess = this.keys().length - API_CACHE_MAX_ENTRIES;
    if (excess <= 0) return;
    const victims = this.oldestFirst(justWritten).slice(
      0,
      API_CACHE_MAX_ENTRIES + excess - TRIM_TO,
    );
    for (const key of victims) this.remove(key);
  }

  private keys(): string[] {
    const found: string[] = [];
    try {
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (key && ENTRY_KEY.test(key)) found.push(key);
      }
    } catch {
      // sin almacenamiento no hay copias
    }
    return found;
  }

  /** claves de las copias, de la más vieja a la más nueva, sin `exceptKey` */
  private oldestFirst(exceptKey: string | null): string[] {
    return this.keys()
      .filter((key) => key !== exceptKey)
      .map((key) => ({ key, savedAt: this.savedAtOf(key) }))
      .sort((a, b) => a.savedAt - b.savedAt)
      .map((entry) => entry.key);
  }

  // una entrada sin fecha legible cuenta como la más vieja: es la primera en irse
  private savedAtOf(key: string): number {
    try {
      const match = /^\{"t":(\d+),/.exec(this.storage.getItem(key) ?? '');
      return match ? Number(match[1]) : 0;
    } catch {
      return 0;
    }
  }

  private write(key: string, value: string): boolean {
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  private remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      // nada que hacer: el almacenamiento no está disponible
    }
  }
}

function entryKey(scope: string, url: string): string {
  return scopedKey(scope, ENTRY_NAME + url);
}

function isEntry(value: unknown): value is { t: number; b: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { t?: unknown }).t === 'number' &&
    'b' in value
  );
}
