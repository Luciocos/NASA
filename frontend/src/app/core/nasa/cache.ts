/** una respuesta guardada; expiresAt null significa que no vence (histórico cerrado) */
export interface CacheEntry<T = unknown> {
  body: T;
  meta: Record<string, string>;
  savedAt: number;
  expiresAt: number | null;
}

/** la parte de la Cache API que se usa, para poder reemplazarla en las pruebas */
export interface CacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
}

export const NASA_CACHE_NAME = 'lotestigo-nasa-v1';

function browserCaches(): CacheStorageLike | null {
  // la Cache API solo existe en contextos seguros (https o localhost)
  const storage = (globalThis as { caches?: CacheStorageLike }).caches;
  return storage ?? null;
}

function isEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<CacheEntry>;
  return 'body' in v && typeof v.savedAt === 'number';
}

/** true si la copia sirve sin ir a la red */
export function isFresh(entry: CacheEntry, maxAgeMs: number, now: number): boolean {
  return (entry.expiresAt === null || now < entry.expiresAt) && now - entry.savedAt < maxAgeMs;
}

/**
 * copia sin conexión de las respuestas de la NASA: Cache API si está, y siempre memoria
 * nunca tira: si el almacenamiento falla, la copia queda solo en memoria
 */
export class NasaCache {
  private readonly memory = new Map<string, CacheEntry>();
  private opened: Promise<CacheLike | null> | null = null;

  constructor(
    private readonly storage: CacheStorageLike | null = browserCaches(),
    private readonly name = NASA_CACHE_NAME,
  ) {}

  async read<T>(key: string): Promise<CacheEntry<T> | null> {
    const hit = this.memory.get(key);
    if (hit) return hit as CacheEntry<T>;
    const cache = await this.open();
    if (!cache) return null;
    try {
      const response = await cache.match(key);
      if (!response) return null;
      const entry: unknown = await response.json();
      if (!isEntry(entry)) return null;
      this.memory.set(key, entry);
      return entry as CacheEntry<T>;
    } catch {
      return null;
    }
  }

  async write(key: string, entry: CacheEntry): Promise<void> {
    this.memory.set(key, entry);
    const cache = await this.open();
    if (!cache) return;
    try {
      const body = JSON.stringify(entry);
      await cache.put(key, new Response(body, { headers: { 'content-type': 'application/json' } }));
    } catch {
      // almacenamiento lleno o bloqueado: alcanza con la memoria
    }
  }

  private open(): Promise<CacheLike | null> {
    this.opened ??= this.storage
      ? this.storage.open(this.name).catch(() => null)
      : Promise.resolve(null);
    return this.opened;
  }
}
