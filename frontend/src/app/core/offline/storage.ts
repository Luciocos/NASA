import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/** la parte de `Storage` que usa el modo sin conexión */
export type KeyValueStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
> & {
  /** true si lo guardado se pierde al cerrar la pestaña */
  readonly volatile?: boolean;
};

/**
 * almacenamiento en memoria con la forma de `Storage`
 * es el respaldo cuando el navegador bloquea localStorage y el doble para las pruebas
 */
export class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>();

  constructor(readonly volatile = false) {}

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/**
 * dónde guarda sus datos el modo sin conexión: localStorage, o memoria si el navegador lo bloquea
 * en los specs se reemplaza con `provideOfflineTesting()` para que nada pase de una prueba a otra
 */
export const OFFLINE_STORAGE = new InjectionToken<KeyValueStorage>('OFFLINE_STORAGE', {
  providedIn: 'root',
  factory: () => browserStorage(inject(DOCUMENT).defaultView) ?? new MemoryStorage(true),
});

function browserStorage(view: Window | null): KeyValueStorage | null {
  try {
    // con los datos del sitio bloqueados, leer la propiedad ya tira SecurityError
    const storage = view?.localStorage;
    return storage && storage.length >= 0 ? storage : null;
  } catch {
    return null;
  }
}
