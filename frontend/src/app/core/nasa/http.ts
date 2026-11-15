import { type CacheEntry, NasaCache, isFresh } from './cache';

export type NasaServiceId = 'power' | 'ornl' | 'cmr' | 'gibs';

export interface ServicePolicy {
  timeoutMs: number;
  retries: number;
  concurrency: number;
}

// ORNL tarda cerca de 60 s en las respuestas buenas y corta con 502 a los 60 s
export const SERVICE_POLICIES: Record<NasaServiceId, ServicePolicy> = {
  power: { timeoutMs: 30_000, retries: 2, concurrency: 2 },
  ornl: { timeoutMs: 75_000, retries: 2, concurrency: 2 },
  cmr: { timeoutMs: 20_000, retries: 2, concurrency: 4 },
  gibs: { timeoutMs: 15_000, retries: 1, concurrency: 4 },
};

export interface NasaRequest {
  url: string;
  service: NasaServiceId;
  /** cuánto sirve una copia guardada; Infinity para lo histórico cerrado */
  maxAgeMs: number;
  as?: 'json' | 'text';
  headers?: Record<string, string>;
  /** cabeceras de la respuesta que se guardan junto al cuerpo */
  keepHeaders?: string[];
  /** las tandas de historial viejo van en 'low' para no demorar lo actual */
  priority?: 'high' | 'low';
}

export interface NasaResponse<T> {
  body: T;
  meta: Record<string, string>;
  /** cuándo llegó de la red (ISO) */
  savedAt: string;
  stale: boolean;
  fromCache: boolean;
}

export type NasaErrorKind = 'timeout' | 'http' | 'network' | 'bad_body' | 'service' | 'offline';

export class NasaServiceError extends Error {
  constructor(
    message: string,
    readonly kind: NasaErrorKind,
    readonly retryable: boolean,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'NasaServiceError';
  }
}

export interface NasaHttpOptions {
  fetch?: typeof fetch;
  cache?: NasaCache;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  isOnline?: () => boolean;
  policies?: Partial<Record<NasaServiceId, Partial<ServicePolicy>>>;
  /** espera antes del reintento n (desde 0) */
  backoffMs?: (attempt: number) => number;
}

/** cola con tope de pedidos simultáneos; los de prioridad alta pasan primero */
class Limiter {
  private active = 0;
  private readonly high: (() => void)[] = [];
  private readonly low: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>, priority: 'high' | 'low'): Promise<T> {
    if (this.active < this.max) this.active++;
    else
      await new Promise<void>((resolve) =>
        (priority === 'high' ? this.high : this.low).push(resolve),
      );
    try {
      return await task();
    } finally {
      // el lugar pasa directo al siguiente en la cola
      const next = this.high.shift() ?? this.low.shift();
      if (next) next();
      else this.active--;
    }
  }
}

function toResponse<T>(entry: CacheEntry<T>, stale: boolean, fromCache: boolean): NasaResponse<T> {
  return {
    body: entry.body,
    meta: entry.meta,
    savedAt: new Date(entry.savedAt).toISOString(),
    stale,
    fromCache,
  };
}

/**
 * acceso a los servicios abiertos de la NASA: copia sin conexión, timeout, reintentos con
 * espera creciente, tope de pedidos por servicio y un solo pedido en vuelo por url
 */
export class NasaHttp {
  private readonly fetchFn: typeof fetch;
  private readonly cache: NasaCache;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly isOnline: () => boolean;
  private readonly backoffMs: (attempt: number) => number;
  private readonly policies: Record<NasaServiceId, ServicePolicy>;
  private readonly limiters: Record<NasaServiceId, Limiter>;
  private readonly inFlight = new Map<string, Promise<NasaResponse<unknown>>>();

  constructor(options: NasaHttpOptions = {}) {
    this.fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.cache = options.cache ?? new NasaCache();
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.isOnline = options.isOnline ?? (() => globalThis.navigator?.onLine !== false);
    this.backoffMs = options.backoffMs ?? ((attempt) => 2000 * 3 ** attempt);
    const ids = Object.keys(SERVICE_POLICIES) as NasaServiceId[];
    this.policies = Object.fromEntries(
      ids.map((id) => [id, { ...SERVICE_POLICIES[id], ...options.policies?.[id] }]),
    ) as Record<NasaServiceId, ServicePolicy>;
    this.limiters = Object.fromEntries(
      ids.map((id) => [id, new Limiter(this.policies[id].concurrency)]),
    ) as Record<NasaServiceId, Limiter>;
  }

  get<T>(request: NasaRequest): Promise<NasaResponse<T>> {
    const pending = this.inFlight.get(request.url);
    if (pending) return pending as Promise<NasaResponse<T>>;
    const promise = this.load<T>(request).finally(() => this.inFlight.delete(request.url));
    this.inFlight.set(request.url, promise);
    return promise;
  }

  private async load<T>(request: NasaRequest): Promise<NasaResponse<T>> {
    const cached = await this.cache.read<T>(request.url);
    if (cached && isFresh(cached, request.maxAgeMs, this.now())) {
      return toResponse(cached, false, true);
    }
    try {
      if (!this.isOnline()) throw new NasaServiceError('sin conexión', 'offline', false);
      const { body, meta } = await this.fetchWithRetry<T>(request);
      const savedAt = this.now();
      const entry: CacheEntry<T> = {
        body,
        meta,
        savedAt,
        expiresAt: Number.isFinite(request.maxAgeMs) ? savedAt + request.maxAgeMs : null,
      };
      await this.cache.write(request.url, entry);
      return toResponse(entry, false, false);
    } catch (error) {
      // sin red o sin respuesta: la copia vencida vale más que nada
      if (cached) return toResponse(cached, true, true);
      throw error;
    }
  }

  private async fetchWithRetry<T>(request: NasaRequest): Promise<CacheEntry<T>> {
    const policy = this.policies[request.service];
    const limiter = this.limiters[request.service];
    for (let attempt = 0; ; attempt++) {
      try {
        return await limiter.run(
          () => this.attempt<T>(request, policy),
          request.priority ?? 'high',
        );
      } catch (error) {
        const retryable = error instanceof NasaServiceError && error.retryable;
        if (!retryable || attempt >= policy.retries) throw error;
        await this.sleep(this.backoffMs(attempt));
      }
    }
  }

  private async attempt<T>(request: NasaRequest, policy: ServicePolicy): Promise<CacheEntry<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
    let status: number;
    let text: string;
    const meta: Record<string, string> = {};
    try {
      const response = await this.fetchFn(request.url, {
        headers: request.headers,
        signal: controller.signal,
      });
      status = response.status;
      for (const name of request.keepHeaders ?? []) {
        const value = response.headers.get(name);
        if (value !== null) meta[name.toLowerCase()] = value;
      }
      text = await response.text();
    } catch {
      if (controller.signal.aborted) {
        throw new NasaServiceError(`sin respuesta en ${policy.timeoutMs} ms`, 'timeout', true);
      }
      throw new NasaServiceError('falló la conexión', 'network', true);
    } finally {
      clearTimeout(timer);
    }
    if (status >= 500) throw new NasaServiceError(`HTTP ${status}`, 'http', true, status);
    if (status >= 400) throw new NasaServiceError(errorText(text, status), 'http', false, status);
    if (request.as === 'text') return { body: text as T, meta, savedAt: 0, expiresAt: null };
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new NasaServiceError('la respuesta no es JSON', 'bad_body', true, status);
    }
    // ORNL a veces contesta 200 con el error como texto JSON entre comillas
    if (typeof body === 'string') throw new NasaServiceError(body, 'service', false, status);
    return { body: body as T, meta, savedAt: 0, expiresAt: null };
  }
}

function errorText(text: string, status: number): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
  } catch {
    // no es JSON: queda el código
  }
  return `HTTP ${status}`;
}
