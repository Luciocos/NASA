import { type CacheLike, type CacheStorageLike, NasaCache } from './cache';
import { ORNL_TOO_MANY_DATES_BODY } from './fixtures';
import { NasaHttp, type NasaHttpOptions, NasaServiceError } from './http';

const URL_A = 'https://example.nasa.test/a';

type Reply = { status?: number; body?: string; headers?: Record<string, string> } | 'hang' | Error;

/** fetch falso: cada llamada consume la próxima respuesta de la lista */
function fakeFetch(replies: Reply[]) {
  const calls: string[] = [];
  let active = 0;
  let maxActive = 0;
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      const reply = replies.shift() ?? { body: '{}' };
      if (reply instanceof Error) throw reply;
      if (reply === 'hang') {
        // no contesta nunca: solo termina si lo corta el timeout
        await new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('abort', 'AbortError')),
          ),
        );
      }
      const r = reply as Exclude<Reply, 'hang' | Error>;
      await Promise.resolve();
      return new Response(r.body ?? '{}', { status: r.status ?? 200, headers: r.headers });
    } finally {
      active--;
    }
  }) as typeof fetch;
  return { fn, calls, maxActive: () => maxActive };
}

function setup(replies: Reply[], extra: Partial<NasaHttpOptions> = {}) {
  let now = Date.parse('2026-11-14T12:00:00Z');
  const fetch = fakeFetch(replies);
  const sleeps: number[] = [];
  const http = new NasaHttp({
    fetch: fetch.fn,
    cache: new NasaCache(null),
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    policies: { ornl: { timeoutMs: 20 } },
    ...extra,
  });
  return { http, fetch, sleeps, advance: (ms: number) => (now += ms) };
}

const get = (http: NasaHttp, maxAgeMs = 60_000, url = URL_A) =>
  http.get<{ v: number }>({ url, service: 'ornl', maxAgeMs });

describe('NasaHttp: copia sin conexión', () => {
  it('usa la copia vigente sin ir a la red', async () => {
    const { http, fetch } = setup([{ body: '{"v":1}' }]);
    await get(http);
    const second = await get(http);
    expect(fetch.calls).toHaveLength(1);
    expect(second).toMatchObject({ body: { v: 1 }, fromCache: true, stale: false });
  });

  it('con la copia vencida va a la red y la renueva', async () => {
    const { http, fetch, advance } = setup([{ body: '{"v":1}' }, { body: '{"v":2}' }]);
    await get(http);
    advance(61_000);
    const res = await get(http);
    expect(fetch.calls).toHaveLength(2);
    expect(res).toMatchObject({ body: { v: 2 }, stale: false, fromCache: false });
  });

  it('con la copia vencida y sin red devuelve la copia marcada stale', async () => {
    const { http, advance } = setup([
      { body: '{"v":1}' },
      new TypeError('offline'),
      new TypeError('x'),
      new TypeError('x'),
    ]);
    await get(http);
    advance(61_000);
    const res = await get(http);
    expect(res).toMatchObject({ body: { v: 1 }, stale: true, fromCache: true });
  });

  it('sin conexión no intenta la red y sin copia informa offline', async () => {
    const { http, fetch } = setup([], { isOnline: () => false });
    await expect(get(http)).rejects.toMatchObject({ kind: 'offline' });
    expect(fetch.calls).toHaveLength(0);
  });

  it('lo histórico cerrado no vence, pero una copia guardada abierta sí', async () => {
    const { http, fetch, advance } = setup([{ body: '{"v":1}' }, { body: '{"v":2}' }]);
    await get(http, 1000);
    advance(2000);
    // la copia se guardó con vencimiento: aunque ahora se pida como cerrada, se renueva
    expect((await get(http, Infinity)).body.v).toBe(2);
    advance(10 * 365 * 86_400_000);
    expect((await get(http, Infinity)).body.v).toBe(2);
    expect(fetch.calls).toHaveLength(2);
  });

  it('guarda en la Cache API y la lee en otra sesión', async () => {
    const store = new Map<string, string>();
    const cache: CacheLike = {
      match: async (key) => (store.has(key) ? new Response(store.get(key)) : undefined),
      put: async (key, response) => void store.set(key, await response.text()),
    };
    const storage: CacheStorageLike = { open: async () => cache };
    const first = setup([{ body: '{"v":7}' }], { cache: new NasaCache(storage) });
    await get(first.http);
    const second = setup([], { cache: new NasaCache(storage) });
    expect((await get(second.http)).body.v).toBe(7);
    expect(second.fetch.calls).toHaveLength(0);
  });
});

describe('NasaHttp: transporte', () => {
  it('reintenta con espera creciente ante timeout, 5xx y cuerpo que no es JSON', async () => {
    const replies: Reply[] = [
      'hang',
      { status: 502, body: '<html>' },
      { body: '<html>' },
      { status: 503 },
    ];
    const { http, fetch, sleeps } = setup(replies, {
      policies: { ornl: { timeoutMs: 20, retries: 3 } },
    });
    const pending = get(http);
    await expect(pending).rejects.toBeInstanceOf(NasaServiceError);
    expect(fetch.calls).toHaveLength(4);
    expect(sleeps).toEqual([2000, 6000, 18000]);
  });

  it('se recupera si un reintento responde bien', async () => {
    const { http, fetch } = setup(['hang', { body: '{"v":3}' }]);
    expect((await get(http)).body.v).toBe(3);
    expect(fetch.calls).toHaveLength(2);
  });

  it('no reintenta un error del servicio y conserva su texto', async () => {
    const { http, fetch } = setup([{ status: 400, body: ORNL_TOO_MANY_DATES_BODY }]);
    await expect(get(http)).rejects.toMatchObject({
      kind: 'http',
      retryable: false,
      message: expect.stringContaining('maximum subset tiles support of 10'),
    });
    const ok200 = setup([{ body: '"Server busy"' }]);
    await expect(get(ok200.http)).rejects.toMatchObject({
      kind: 'service',
      message: 'Server busy',
    });
    expect(fetch.calls).toHaveLength(1);
  });

  it('respeta el tope de pedidos simultáneos y no duplica una url en vuelo', async () => {
    const { http, fetch } = setup([]);
    const urls = ['1', '2', '3', '4', '5'].map((n) => `${URL_A}/${n}`);
    await Promise.all([...urls, urls[0], urls[0]].map((u) => get(http, 1000, u)));
    expect(fetch.calls).toHaveLength(5);
    expect(fetch.maxActive()).toBe(2);
  });

  it('guarda las cabeceras pedidas', async () => {
    const { http } = setup([{ body: '{}', headers: { 'CMR-Hits': '19' } }]);
    const res = await http.get({
      url: URL_A,
      service: 'cmr',
      maxAgeMs: 1,
      keepHeaders: ['cmr-hits'],
    });
    expect(res.meta).toEqual({ 'cmr-hits': '19' });
  });
});
