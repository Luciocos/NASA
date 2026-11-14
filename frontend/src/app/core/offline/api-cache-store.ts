import { Service, inject } from '@angular/core';

import { OFFLINE_STORAGE } from './storage';

const PREFIX = 'lotestigo:cache:v1:';

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
 * nunca tira: si el almacenamiento falta o está lleno, simplemente no guarda
 */
@Service()
export class ApiCacheStore {
  private readonly storage = inject(OFFLINE_STORAGE);

  /** cantidad de respuestas guardadas */
  get size(): number {
    return this.entries().length;
  }

  /** la copia guardada de una url (con sus parámetros), o null si no hay */
  get<T = unknown>(url: string): CachedResponse<T> | null {
    const key = PREFIX + url;
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
  set(url: string, body: unknown, savedAt: Date = new Date()): boolean {
    const key = PREFIX + url;
    let value: string;
    try {
      // la fecha va primero para poder leerla sin interpretar todo el cuerpo
      value = `{"t":${savedAt.getTime()},"b":${JSON.stringify(body) ?? 'null'}}`;
    } catch {
      return false;
    }
    // almacenamiento lleno: se borra lo más viejo y se prueba una sola vez más
    if (!this.write(key, value) && !(this.makeRoom(url) && this.write(key, value))) return false;
    this.trim(key);
    return true;
  }

  /** borra la copia de una url */
  delete(url: string): void {
    this.remove(PREFIX + url);
  }

  /** borra todas las copias */
  clear(): void {
    for (const entry of this.entries()) this.remove(entry.key);
  }

  /**
   * libera espacio borrando la mitad más vieja de las copias (sin tocar la de `keepUrl`)
   * devuelve false si no había nada para borrar
   */
  makeRoom(keepUrl?: string): boolean {
    const keep = keepUrl === undefined ? null : PREFIX + keepUrl;
    const oldestFirst = this.entries()
      .filter((entry) => entry.key !== keep)
      .sort((a, b) => a.savedAt - b.savedAt);
    const victims = oldestFirst.slice(0, Math.ceil(oldestFirst.length / 2));
    for (const entry of victims) this.remove(entry.key);
    return victims.length > 0;
  }

  private trim(justWritten: string): void {
    const entries = this.entries();
    if (entries.length <= API_CACHE_MAX_ENTRIES) return;
    const oldestFirst = entries
      .filter((entry) => entry.key !== justWritten)
      .sort((a, b) => a.savedAt - b.savedAt);
    for (const entry of oldestFirst.slice(0, entries.length - TRIM_TO)) this.remove(entry.key);
  }

  private entries(): { key: string; savedAt: number }[] {
    const found: { key: string; savedAt: number }[] = [];
    try {
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (key?.startsWith(PREFIX)) {
          found.push({ key, savedAt: savedAtOf(this.storage.getItem(key)) });
        }
      }
    } catch {
      // sin almacenamiento no hay copias
    }
    return found;
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

function isEntry(value: unknown): value is { t: number; b: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { t?: unknown }).t === 'number' &&
    'b' in value
  );
}

// una entrada sin fecha legible cuenta como la más vieja: es la primera en irse
function savedAtOf(raw: string | null): number {
  const match = raw === null ? null : /^\{"t":(\d+),/.exec(raw);
  return match ? Number(match[1]) : 0;
}
