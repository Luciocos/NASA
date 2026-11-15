import { TestBed } from '@angular/core/testing';

import { API_CACHE_MAX_ENTRIES, ApiCacheStore } from './api-cache-store';
import { KeyValueStorage, MemoryStorage, OFFLINE_STORAGE } from './storage';

// sin sesión las copias van a nombre de "anon"
const PREFIX = 'lotestigo:anon:cache:v1:';

/** almacenamiento que se llena: tira QuotaExceededError al pasar cierta cantidad de caracteres */
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

/** almacenamiento roto: cualquier acceso tira */
const BROKEN_STORAGE: KeyValueStorage = {
  get length(): number {
    throw new DOMException('sin acceso', 'SecurityError');
  },
  key: () => {
    throw new DOMException('sin acceso', 'SecurityError');
  },
  getItem: () => {
    throw new DOMException('sin acceso', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('sin acceso', 'SecurityError');
  },
  removeItem: () => {
    throw new DOMException('sin acceso', 'SecurityError');
  },
};

function setup(storage: KeyValueStorage = new MemoryStorage()): {
  store: ApiCacheStore;
  storage: KeyValueStorage;
} {
  TestBed.configureTestingModule({ providers: [{ provide: OFFLINE_STORAGE, useValue: storage }] });
  return { store: TestBed.inject(ApiCacheStore), storage };
}

describe('ApiCacheStore', () => {
  it('guarda el cuerpo con su fecha bajo el prefijo de la copia', () => {
    const { store, storage } = setup();
    const savedAt = new Date('2026-11-14T16:20:00Z');

    expect(store.set('/api/lots/', [{ id: 1 }], savedAt)).toBe(true);

    expect(storage.getItem(`${PREFIX}/api/lots/`)).not.toBeNull();
    expect(store.get('/api/lots/')).toEqual({ body: [{ id: 1 }], savedAt });
    expect(store.size).toBe(1);
  });

  it('devuelve null si no hay copia de esa url', () => {
    const { store } = setup();
    store.set('/api/lots/1/events/?type=TILLAGE', { count: 1 });

    expect(store.get('/api/lots/1/events/')).toBeNull();
    expect(store.get('/api/lots/1/events/?type=TILLAGE')?.body).toEqual({ count: 1 });
  });

  it('guarda también un cuerpo vacío', () => {
    const { store } = setup();
    store.set('/api/lots/', null);

    expect(store.get('/api/lots/')?.body).toBeNull();
  });

  it('reemplaza la copia anterior de la misma url', () => {
    const { store } = setup();
    store.set('/api/lots/', ['vieja'], new Date('2026-11-13T10:00:00Z'));
    store.set('/api/lots/', ['nueva'], new Date('2026-11-14T10:00:00Z'));

    expect(store.size).toBe(1);
    expect(store.get('/api/lots/')?.body).toEqual(['nueva']);
  });

  it('descarta una entrada rota en vez de fallar', () => {
    const { store, storage } = setup();
    storage.setItem(`${PREFIX}/api/lots/`, '{"t":1,"b":');
    storage.setItem(`${PREFIX}/api/lots/2/`, '"no es una entrada"');

    expect(store.get('/api/lots/')).toBeNull();
    expect(store.get('/api/lots/2/')).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('delete y clear borran solo las copias, no lo demás que haya guardado', () => {
    const { store, storage } = setup();
    storage.setItem('lotestigo:outbox:v1', '[]');
    store.set('/api/lots/', []);
    store.set('/api/lots/1/', {});
    store.set('/api/lots/2/', {});

    store.delete('/api/lots/1/');
    expect(store.get('/api/lots/1/')).toBeNull();
    expect(store.size).toBe(2);

    store.clear();
    expect(store.size).toBe(0);
    expect(storage.getItem('lotestigo:outbox:v1')).toBe('[]');
  });

  it('no tira si el almacenamiento no está disponible', () => {
    const { store } = setup(BROKEN_STORAGE);

    expect(store.set('/api/lots/', [])).toBe(false);
    expect(store.get('/api/lots/')).toBeNull();
    expect(store.size).toBe(0);
    expect(() => store.delete('/api/lots/')).not.toThrow();
    expect(() => store.clear()).not.toThrow();
    expect(store.makeRoom()).toBe(false);
  });

  it('no guarda un cuerpo que no se puede serializar', () => {
    const { store } = setup();
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    expect(store.set('/api/lots/', circular)).toBe(false);
    expect(store.size).toBe(0);
  });

  it('con el almacenamiento lleno borra las copias más viejas y reintenta', () => {
    // cada entrada ocupa unos 130 caracteres: entran tres, la cuarta no
    const { store } = setup(new QuotaStorage(450));
    const body = 'x'.repeat(100);
    store.set('/api/lots/1/', body, new Date('2026-11-10T00:00:00Z'));
    store.set('/api/lots/2/', body, new Date('2026-11-11T00:00:00Z'));
    store.set('/api/lots/3/', body, new Date('2026-11-12T00:00:00Z'));

    expect(store.set('/api/lots/4/', body, new Date('2026-11-13T00:00:00Z'))).toBe(true);

    expect(store.get('/api/lots/1/')).toBeNull();
    expect(store.get('/api/lots/2/')).toBeNull();
    expect(store.get('/api/lots/3/')?.body).toBe(body);
    expect(store.get('/api/lots/4/')?.body).toBe(body);
  });

  it('si ni borrando entra, no guarda y conserva la copia anterior de esa url', () => {
    const { store } = setup(new QuotaStorage(200));
    store.set('/api/lots/', 'chica', new Date('2026-11-10T00:00:00Z'));

    expect(store.set('/api/lots/', 'x'.repeat(500), new Date('2026-11-11T00:00:00Z'))).toBe(false);

    expect(store.get('/api/lots/')?.body).toBe('chica');
  });

  it('nunca pasa el tope de entradas: al superarlo se van las más viejas', () => {
    const { store } = setup();
    const start = Date.parse('2026-01-01T00:00:00Z');
    for (let index = 0; index <= API_CACHE_MAX_ENTRIES; index++) {
      store.set(`/api/lots/${index}/`, index, new Date(start + index * 60_000));
      expect(store.size).toBeLessThanOrEqual(API_CACHE_MAX_ENTRIES);
    }

    expect(store.get('/api/lots/0/')).toBeNull();
    expect(store.get(`/api/lots/${API_CACHE_MAX_ENTRIES}/`)?.body).toBe(API_CACHE_MAX_ENTRIES);
    expect(store.get(`/api/lots/${API_CACHE_MAX_ENTRIES - 1}/`)?.body).toBe(
      API_CACHE_MAX_ENTRIES - 1,
    );
  });

  it('makeRoom borra la mitad más vieja y respeta la url que se le pide conservar', () => {
    const { store } = setup();
    store.set('/api/lots/1/', 1, new Date('2026-11-10T00:00:00Z'));
    store.set('/api/lots/2/', 2, new Date('2026-11-11T00:00:00Z'));
    store.set('/api/lots/3/', 3, new Date('2026-11-12T00:00:00Z'));
    store.set('/api/lots/4/', 4, new Date('2026-11-13T00:00:00Z'));

    expect(store.makeRoom('/api/lots/1/')).toBe(true);

    expect(store.get('/api/lots/1/')?.body).toBe(1);
    expect(store.get('/api/lots/2/')).toBeNull();
    expect(store.get('/api/lots/3/')).toBeNull();
    expect(store.get('/api/lots/4/')?.body).toBe(4);
  });

  it('cada usuario lee solo sus copias, y las públicas quedan aparte', () => {
    const { store, storage } = setup();
    store.set('/api/lots/', ['de u1'], new Date(), 'u1');
    store.set('/api/examples/', ['ejemplos'], new Date());

    expect(store.get('/api/lots/', 'u1')?.body).toEqual(['de u1']);
    expect(store.get('/api/lots/', 'u2')).toBeNull();
    expect(store.get('/api/lots/')).toBeNull();
    expect(store.get('/api/examples/')?.body).toEqual(['ejemplos']);
    expect(storage.getItem('lotestigo:u1:cache:v1:/api/lots/')).not.toBeNull();
    expect(store.size).toBe(2);
  });
});
