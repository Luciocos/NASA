import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LotCreate, LotDetail } from '../models';
import { ApiCacheStore } from './api-cache-store';
import { Connectivity } from './connectivity';
import { LotOutbox, LotSaveResult, PendingLot } from './lot-outbox';
import { KeyValueStorage, MemoryStorage, OFFLINE_STORAGE } from './storage';

const STORAGE_KEY = 'lotestigo:outbox:v1';
const UPLOAD = { method: 'POST', url: '/api/lots/' };
const CREATED = { status: 201, statusText: 'Created' };
const HEALTHY = { status: 'ok', database: 'ok' };

// lote armado para la prueba: no representa un lote real
const BODY: LotCreate = {
  name: 'Lote de prueba',
  locality: 'Casilda',
  province: 'Santa Fe',
  renspa: null,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-61.2, -33.05],
        [-61.19, -33.05],
        [-61.19, -33.04],
        [-61.2, -33.05],
      ],
    ],
  },
};

function makeLot(id: number, name = BODY.name): LotDetail {
  return {
    id,
    name,
    renspa: '',
    locality: 'Casilda',
    province: 'Santa Fe',
    geometry: BODY.geometry,
    area_ha: 51.6,
    event_count: 0,
    created_at: '2026-11-14T10:00:00Z',
    campaigns: [],
  };
}

function makePending(localId: string, overrides: Partial<PendingLot> = {}): PendingLot {
  return {
    localId,
    body: { ...BODY, name: `Lote ${localId}` },
    createdAt: '2026-11-14T10:00:00.000Z',
    attempts: 1,
    rejected: false,
    error: null,
    ...overrides,
  };
}

/** deja correr las continuaciones pendientes de la pasada de sincronización */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}

describe('LotOutbox', () => {
  let outbox: LotOutbox;
  let http: HttpTestingController;
  let connectivity: Connectivity;
  let storage: KeyValueStorage;

  /** arma el servicio. `stored` es la cola que ya estaba guardada en el dispositivo */
  function setup(stored: PendingLot[] = [], customStorage?: KeyValueStorage): void {
    storage = customStorage ?? new MemoryStorage();
    if (stored.length > 0) storage.setItem(STORAGE_KEY, JSON.stringify(stored));
    TestBed.configureTestingModule({
      providers: [provideHttpClientTesting(), { provide: OFFLINE_STORAGE, useValue: storage }],
    });
    outbox = TestBed.inject(LotOutbox);
    http = TestBed.inject(HttpTestingController);
    connectivity = TestBed.inject(Connectivity);
  }

  const storedQueue = (): PendingLot[] => JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
  const names = (): string[] => outbox.pending().map((item) => item.body.name);

  function failUpload(status: number): void {
    const request = http.expectOne(UPLOAD);
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ error: 'backend sin conexión' }, { status, statusText: 'Error' });
  }

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    // solo se puede contar timers con los relojes falsos activos
    if (vi.isFakeTimers()) expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createOrQueue', () => {
    it('con el backend disponible crea el lote y no encola nada', () => {
      setup();
      let result: LotSaveResult | undefined;
      outbox.createOrQueue(BODY).subscribe((value) => (result = value));

      const request = http.expectOne(UPLOAD);
      expect(request.request.body).toEqual(BODY);
      request.flush(makeLot(42), CREATED);

      expect(result).toEqual({ kind: 'created', lot: makeLot(42) });
      expect(outbox.pending()).toEqual([]);
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
    });

    it.each([0, 502, 503, 504])('con error %i lo encola y lo guarda en el dispositivo', (status) => {
      setup();
      let result: LotSaveResult | undefined;
      outbox.createOrQueue(BODY).subscribe((value) => (result = value));

      failUpload(status);

      const [pending] = outbox.pending();
      expect(result).toEqual({ kind: 'queued', pending });
      expect(pending.localId).toMatch(/\S{8,}/);
      expect(pending.body).toEqual(BODY);
      expect(new Date(pending.createdAt).toISOString()).toBe(pending.createdAt);
      expect(pending).toMatchObject({ attempts: 1, rejected: false, error: null });
      expect(storedQueue()).toEqual([pending]);
      expect(outbox.unsaved()).toBe(false);
    });

    it('propaga el 400 de validación para que el formulario lo muestre, sin encolar', () => {
      setup();
      let error: HttpErrorResponse | undefined;
      let result: LotSaveResult | undefined;
      outbox.createOrQueue(BODY).subscribe({
        next: (value) => (result = value),
        error: (value: HttpErrorResponse) => (error = value),
      });

      http
        .expectOne(UPLOAD)
        .flush(
          { geometry: ['geometry no es un polígono válido (se cruza o no cierra)'] },
          { status: 400, statusText: 'Bad Request' },
        );

      expect(result).toBeUndefined();
      expect(error?.status).toBe(400);
      expect(error?.error.geometry[0]).toContain('se cruza');
      expect(outbox.pending()).toEqual([]);
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('si el backend no contesta en 20 segundos corta el pedido y lo encola', () => {
      vi.useFakeTimers();
      setup();
      let result: LotSaveResult | undefined;
      outbox.createOrQueue(BODY).subscribe((value) => (result = value));
      const request = http.expectOne(UPLOAD);

      vi.advanceTimersByTime(19_999);
      expect(result).toBeUndefined();
      vi.advanceTimersByTime(1);

      expect(result?.kind).toBe('queued');
      expect(request.cancelled).toBe(true);
      expect(outbox.pending()).toHaveLength(1);
    });

    it('cada lote encolado tiene su propio localId, también sin crypto.randomUUID', () => {
      setup();
      Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: undefined });
      try {
        outbox.createOrQueue(BODY).subscribe();
        failUpload(0);
        outbox.createOrQueue(BODY).subscribe();
        failUpload(0);
      } finally {
        delete (window.crypto as { randomUUID?: unknown }).randomUUID;
      }

      const [first, second] = outbox.pending();
      expect(first.localId).toMatch(/^local-/);
      expect(second.localId).toMatch(/^local-/);
      expect(first.localId).not.toBe(second.localId);
      expect(window.crypto.randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('lo guardado en el dispositivo', () => {
    it('al iniciar retoma la cola guardada', () => {
      const stored = [makePending('a'), makePending('b', { rejected: true, error: 'Nombre: falta.' })];
      setup(stored);

      expect(outbox.pending()).toEqual(stored);
    });

    it('ignora lo guardado que no tiene forma de lote pendiente', () => {
      const storageWithJunk = new MemoryStorage();
      storageWithJunk.setItem(
        STORAGE_KEY,
        JSON.stringify([{ localId: 1 }, null, 'x', makePending('a')]),
      );
      setup([], storageWithJunk);

      expect(names()).toEqual(['Lote a']);
    });

    it('arranca vacía si lo guardado está roto', () => {
      const broken = new MemoryStorage();
      broken.setItem(STORAGE_KEY, '{no es json');
      setup([], broken);

      expect(outbox.pending()).toEqual([]);
    });

    it('toma los cambios que hace otra pestaña', () => {
      setup([makePending('a')]);

      storage.setItem(STORAGE_KEY, JSON.stringify([makePending('a'), makePending('b')]));
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
      expect(names()).toEqual(['Lote a', 'Lote b']);

      storage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: 'otra-clave' }));
      expect(names()).toEqual(['Lote a', 'Lote b']);
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
      expect(names()).toEqual([]);
    });
  });

  describe('sync', () => {
    it('sube los pendientes en orden y los saca de la cola', async () => {
      setup([makePending('a'), makePending('b')]);

      const done = outbox.sync();
      expect(outbox.syncing()).toBe(true);
      const first = http.expectOne(UPLOAD);
      expect(first.request.body.name).toBe('Lote a');
      first.flush(makeLot(11, 'Lote a'), CREATED);
      await settle();

      expect(names()).toEqual(['Lote b']);
      expect(storedQueue()).toHaveLength(1);
      const second = http.expectOne(UPLOAD);
      expect(second.request.body.name).toBe('Lote b');
      second.flush(makeLot(12, 'Lote b'), CREATED);
      await done;

      expect(outbox.pending()).toEqual([]);
      expect(outbox.syncing()).toBe(false);
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
      expect(outbox.lastSynced()).toEqual([
        { localId: 'a', lot: makeLot(11, 'Lote a') },
        { localId: 'b', lot: makeLot(12, 'Lote b') },
      ]);
    });

    it('sin pendientes no pide nada', async () => {
      setup();

      await outbox.sync();

      expect(outbox.syncing()).toBe(false);
      expect(outbox.lastSynced()).toEqual([]);
    });

    it('un 400 marca el lote como rechazado con el mensaje del backend y sigue con el resto', async () => {
      setup([makePending('a'), makePending('b')]);

      const done = outbox.sync();
      http
        .expectOne(UPLOAD)
        .flush(
          { name: ['Este campo no puede estar en blanco.'] },
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();
      http.expectOne(UPLOAD).flush(makeLot(12, 'Lote b'), CREATED);
      await done;

      expect(outbox.pending()).toEqual([
        makePending('a', {
          attempts: 2,
          rejected: true,
          error: 'Nombre: Este campo no puede estar en blanco.',
        }),
      ]);
      expect(storedQueue()).toEqual(outbox.pending());
      expect(outbox.lastSynced()).toEqual([{ localId: 'b', lot: makeLot(12, 'Lote b') }]);
    });

    it('un rechazado no se vuelve a subir solo', async () => {
      setup([makePending('a', { rejected: true, error: 'Nombre: falta.' })]);

      await outbox.sync();

      expect(outbox.syncing()).toBe(false);
      expect(names()).toEqual(['Lote a']);
    });

    it('un error del backend sin mensaje también lo deja rechazado y a la vista', async () => {
      setup([makePending('a')]);

      const done = outbox.sync();
      http.expectOne(UPLOAD).flush('<h1>Server Error (500)</h1>', {
        status: 500,
        statusText: 'Internal Server Error',
      });
      await done;

      expect(outbox.pending()[0]).toMatchObject({
        rejected: true,
        error: 'El backend respondió con un error (500).',
      });
    });

    it.each([0, 502, 503, 504])('un error %i corta la pasada y deja todo en la cola', async (status) => {
      setup([makePending('a'), makePending('b')]);

      const done = outbox.sync();
      failUpload(status);
      await done;

      // el segundo ni se intentó
      http.expectNone(UPLOAD);
      expect(outbox.pending()).toEqual([makePending('a', { attempts: 2 }), makePending('b')]);
      expect(outbox.syncing()).toBe(false);
      expect(outbox.lastSynced()).toEqual([]);
    });

    it('nunca corren dos pasadas a la vez', async () => {
      setup([makePending('a')]);

      const first = outbox.sync();
      const second = outbox.sync();

      expect(second).toBe(first);
      http.expectOne(UPLOAD).flush(makeLot(11, 'Lote a'), CREATED);
      await first;
      expect(outbox.pending()).toEqual([]);

      // terminada la pasada, la siguiente llamada arranca una nueva
      expect(outbox.sync()).not.toBe(first);
      await settle();
    });

    it('una pasada que no sube nada conserva lo que subió la anterior', async () => {
      setup([makePending('a')]);
      const first = outbox.sync();
      http.expectOne(UPLOAD).flush(makeLot(11, 'Lote a'), CREATED);
      await first;

      await outbox.sync();

      expect(outbox.lastSynced()).toEqual([{ localId: 'a', lot: makeLot(11, 'Lote a') }]);
    });

    it('sube también lo que se encola mientras la pasada está en curso', async () => {
      setup([makePending('a')]);

      const done = outbox.sync();
      const first = http.expectOne(UPLOAD);
      outbox.createOrQueue({ ...BODY, name: 'Lote nuevo' }).subscribe();
      // expectOne ya sacó de la lista el pedido de la pasada: queda solo el del alta nueva
      http.expectOne(UPLOAD).error(new ProgressEvent('error'));
      expect(names()).toEqual(['Lote a', 'Lote nuevo']);

      first.flush(makeLot(11, 'Lote a'), CREATED);
      await settle();
      http.expectOne(UPLOAD).flush(makeLot(12, 'Lote nuevo'), CREATED);
      await done;

      expect(outbox.pending()).toEqual([]);
      expect(outbox.lastSynced()).toHaveLength(2);
    });
  });

  describe('discard y retry', () => {
    it('discard saca el lote de la cola y del dispositivo', () => {
      setup([makePending('a'), makePending('b', { rejected: true, error: 'Nombre: falta.' })]);

      outbox.discard('b');

      expect(names()).toEqual(['Lote a']);
      expect(storedQueue()).toEqual(outbox.pending());
    });

    it('un lote descartado durante la pasada ya no se sube', async () => {
      setup([makePending('a'), makePending('b')]);

      const done = outbox.sync();
      outbox.discard('b');
      http.expectOne(UPLOAD).flush(makeLot(11, 'Lote a'), CREATED);
      await done;

      http.expectNone(UPLOAD);
      expect(outbox.pending()).toEqual([]);
    });

    it('retry le quita el rechazo y lo vuelve a subir', async () => {
      setup([makePending('a', { attempts: 2, rejected: true, error: 'Nombre: falta.' })]);

      const done = outbox.retry('a');
      expect(outbox.pending()[0]).toMatchObject({ rejected: false, error: null });
      http.expectOne(UPLOAD).flush(makeLot(11, 'Lote a'), CREATED);
      await done;

      expect(outbox.pending()).toEqual([]);
      expect(outbox.lastSynced()).toEqual([{ localId: 'a', lot: makeLot(11, 'Lote a') }]);
    });
  });

  describe('sincronización automática', () => {
    it('al iniciar sube la cola en cuanto el backend responde', async () => {
      setup([makePending('a')]);
      TestBed.tick();
      http.expectNone(UPLOAD);

      connectivity.start();
      http.expectOne('/api/health/').flush(HEALTHY);
      TestBed.tick();

      http.expectOne(UPLOAD).flush(makeLot(11, 'Lote a'), CREATED);
      await settle();
      expect(outbox.pending()).toEqual([]);
    });

    it('con el backend caído espera, y sube cuando vuelve', async () => {
      vi.useFakeTimers();
      setup([makePending('a')]);
      connectivity.start();
      http.expectOne('/api/health/').error(new ProgressEvent('error'));
      TestBed.tick();
      http.expectNone(UPLOAD);

      vi.advanceTimersByTime(2_000);
      http.expectOne('/api/health/').flush(HEALTHY);
      TestBed.tick();

      http.expectOne(UPLOAD).flush(makeLot(11, 'Lote a'), CREATED);
      await settle();
      expect(outbox.pending()).toEqual([]);
    });

    it('si el alta falla con el backend sano, espera antes de volver a intentar', async () => {
      vi.useFakeTimers();
      setup([makePending('a')]);
      connectivity.start();
      http.expectOne('/api/health/').flush(HEALTHY);
      TestBed.tick();

      // el alta devuelve 502 pero health dice que el backend está bien
      failUpload(502);
      await settle();
      expect(connectivity.backend()).toBe('checking');
      http.expectOne('/api/health/').flush(HEALTHY);
      TestBed.tick();

      vi.advanceTimersByTime(4_999);
      http.expectNone(UPLOAD);
      vi.advanceTimersByTime(1);
      failUpload(502);
      await settle();
      http.expectOne('/api/health/').flush(HEALTHY);
      TestBed.tick();

      // la espera se duplica en cada falla
      vi.advanceTimersByTime(9_999);
      http.expectNone(UPLOAD);
      vi.advanceTimersByTime(1);
      http.expectOne(UPLOAD).flush(makeLot(11, 'Lote a'), CREATED);
      await settle();

      expect(outbox.pending()).toEqual([]);
      expect(connectivity.backend()).toBe('up');
    });

    it('"Sincronizar ahora" no espera: sync() a mano sube aunque haya una espera en curso', async () => {
      vi.useFakeTimers();
      setup([makePending('a')]);
      connectivity.start();
      http.expectOne('/api/health/').flush(HEALTHY);
      TestBed.tick();
      failUpload(502);
      await settle();
      http.expectOne('/api/health/').flush(HEALTHY);
      TestBed.tick();

      const done = outbox.sync();
      http.expectOne(UPLOAD).flush(makeLot(11, 'Lote a'), CREATED);
      await done;

      expect(outbox.pending()).toEqual([]);
      // el timer de la espera sigue programado, pero ya no encuentra nada para subir
      vi.advanceTimersByTime(5_000);
      await settle();
    });
  });

  describe('almacenamiento con problemas', () => {
    /** se llena al pasar `maxChars` caracteres entre todos los valores */
    class QuotaStorage extends MemoryStorage {
      constructor(private readonly maxChars: number) {
        super();
      }

      override setItem(key: string, value: string): void {
        let used = value.length;
        for (let index = 0; index < this.length; index++) {
          const other = this.key(index)!;
          if (other !== key) used += this.getItem(other)!.length;
        }
        if (used > this.maxChars) throw new DOMException('lleno', 'QuotaExceededError');
        super.setItem(key, value);
      }
    }

    it('si no hay lugar, borra copias del backend para guardar el lote', () => {
      setup([], new QuotaStorage(900));
      const cache = TestBed.inject(ApiCacheStore);
      cache.set('/api/lots/1/', 'x'.repeat(300), new Date('2026-11-10T00:00:00Z'));
      cache.set('/api/lots/2/', 'x'.repeat(300), new Date('2026-11-11T00:00:00Z'));

      outbox.createOrQueue(BODY).subscribe();
      failUpload(0);

      expect(storedQueue()).toEqual(outbox.pending());
      expect(outbox.unsaved()).toBe(false);
      expect(cache.get('/api/lots/1/')).toBeNull();
      expect(cache.get('/api/lots/2/')).not.toBeNull();
    });

    it('si ni así se puede guardar, la cola sigue en memoria y lo avisa', () => {
      setup([], new QuotaStorage(10));

      outbox.createOrQueue(BODY).subscribe();
      failUpload(0);

      expect(outbox.pending()).toHaveLength(1);
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
      expect(outbox.unsaved()).toBe(true);

      // lo que quedó en memoria no se pierde aunque otra pestaña avise un cambio
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
      expect(outbox.pending()).toHaveLength(1);
    });

    it('avisa si el almacenamiento es volátil', () => {
      setup([], new MemoryStorage(true));

      expect(outbox.unsaved()).toBe(true);
    });
  });

  describe('varias pestañas', () => {
    function stubLocks(grant: boolean): { request: ReturnType<typeof vi.fn> } {
      const locks = {
        request: vi.fn(
          async (_name: string, _options: LockOptions, task: (lock: unknown) => Promise<void>) =>
            task(grant ? { name: _name } : null),
        ),
      };
      Object.defineProperty(window.navigator, 'locks', { configurable: true, value: locks });
      return locks;
    }

    afterEach(() => {
      delete (window.navigator as { locks?: unknown }).locks;
    });

    it('si otra pestaña ya está subiendo la cola, esta no la sube también', async () => {
      const locks = stubLocks(false);
      setup([makePending('a')]);

      await outbox.sync();

      expect(locks.request).toHaveBeenCalledWith(
        'lotestigo:outbox:sync',
        { ifAvailable: true },
        expect.any(Function),
      );
      http.expectNone(UPLOAD);
      expect(names()).toEqual(['Lote a']);
    });

    it('con el candado libre sube, partiendo de lo que haya dejado la otra pestaña', async () => {
      stubLocks(true);
      setup([makePending('a'), makePending('b')]);
      // otra pestaña ya subió el primero
      storage.setItem(STORAGE_KEY, JSON.stringify([makePending('b')]));

      const done = outbox.sync();
      await settle();
      const request = http.expectOne(UPLOAD);
      expect(request.request.body.name).toBe('Lote b');
      request.flush(makeLot(12, 'Lote b'), CREATED);
      await done;

      expect(outbox.pending()).toEqual([]);
    });
  });
});
