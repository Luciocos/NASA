import {
  HttpClient,
  HttpErrorResponse,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Api } from '../api';
import { AuthSession } from '../auth/auth-session';
import { TEST_TOKEN, TEST_USER } from '../auth/testing';
import { SAVED_COPY_HEADER, apiCacheInterceptor } from './api-cache.interceptor';
import { ApiCacheStore } from './api-cache-store';
import { Connectivity } from './connectivity';
import { provideOfflineTesting } from './testing';

// lotes armados para la prueba: no representan lotes reales
const LOTS = [{ id: 1, name: 'Lote de prueba' }];
const SAVED_AT = new Date('2026-11-14T16:20:00Z');

describe('apiCacheInterceptor', () => {
  let api: Api;
  let http: HttpTestingController;
  let store: ApiCacheStore;
  let connectivity: Connectivity;

  const failRequest = (url: string, status: number): void => {
    const request = http.expectOne(url);
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({ error: 'backend sin conexión' }, { status, statusText: 'Error' });
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiCacheInterceptor])),
        provideHttpClientTesting(),
        provideOfflineTesting(),
      ],
    });
    api = TestBed.inject(Api);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ApiCacheStore);
    connectivity = TestBed.inject(Connectivity);
  });

  afterEach(() => http.verify());

  it('guarda el cuerpo de una respuesta 200 con la url y sus parámetros como clave', () => {
    let received: unknown;
    api.lotEvents(1, { type: 'TILLAGE' }).subscribe((log) => (received = log));

    http.expectOne('/api/lots/1/events/?type=TILLAGE').flush({ lot: 1, count: 0 });

    expect(received).toEqual({ lot: 1, count: 0 });
    expect(store.get('/api/lots/1/events/?type=TILLAGE')?.body).toEqual({ lot: 1, count: 0 });
    expect(store.get('/api/lots/1/events/')).toBeNull();
  });

  it('una lectura que llega de la red limpia la marca de datos guardados', () => {
    connectivity.noteCacheServed(SAVED_AT);

    api.lots().subscribe();
    http.expectOne('/api/lots/').flush(LOTS);

    expect(connectivity.cacheServedAt()).toBeNull();
  });

  it.each([0, 502, 503, 504])('con error %i sirve la copia guardada como un 200', (status) => {
    store.set('/api/lots/', LOTS, SAVED_AT);
    let response: HttpResponse<unknown> | undefined;
    TestBed.inject(HttpClient)
      .get('/api/lots/', { observe: 'response' })
      .subscribe((value) => (response = value));

    failRequest('/api/lots/', status);

    expect(response?.status).toBe(200);
    expect(response?.body).toEqual(LOTS);
    expect(response?.headers.get(SAVED_COPY_HEADER)).toBe(SAVED_AT.toISOString());
    expect(connectivity.cacheServedAt()).toBeInstanceOf(Date);
    expect(connectivity.cacheSavedAt()).toEqual(SAVED_AT);
  });

  it.each([0, 502, 503, 504])('con error %i y sin copia propaga el error original', (status) => {
    let error: HttpErrorResponse | undefined;
    api.lot(7).subscribe({ error: (value: HttpErrorResponse) => (error = value) });

    failRequest('/api/lots/7/', status);

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error?.status).toBe(status);
    expect(connectivity.cacheServedAt()).toBeNull();
  });

  it.each([400, 404, 410])('con error %i no usa la copia: el backend sí respondió', (status) => {
    store.set('/api/passports/abc/', { token: 'abc' }, SAVED_AT);
    let received: unknown;
    let error: HttpErrorResponse | undefined;
    api.passport('abc').subscribe({
      next: (value) => (received = value),
      error: (value: HttpErrorResponse) => (error = value),
    });

    http
      .expectOne('/api/passports/abc/')
      .flush({ detail: 'No encontrado.' }, { status, statusText: 'Error' });

    expect(received).toBeUndefined();
    expect(error?.status).toBe(status);
    expect(connectivity.cacheServedAt()).toBeNull();
    // la copia queda: sirve si después se cae la conexión
    expect(store.get('/api/passports/abc/')?.body).toEqual({ token: 'abc' });
  });

  it('guarda los pasaportes y cada subruta de lotes por separado', () => {
    api.passport('abc').subscribe();
    api.lot(1).subscribe();
    api.footprint(1, '2025/26').subscribe();
    api.score(1).subscribe();

    http.expectOne('/api/passports/abc/').flush({ token: 'abc' });
    http.expectOne('/api/lots/1/').flush({ id: 1 });
    http.expectOne('/api/lots/1/footprint/?campaign=2025/26').flush({ lot: 1 });
    http.expectOne('/api/lots/1/score/').flush({ score: null });

    expect(store.size).toBe(4);
    expect(store.get('/api/lots/1/footprint/?campaign=2025/26')?.body).toEqual({ lot: 1 });
  });

  it('nunca guarda ni sirve una copia de health', () => {
    let failed = false;
    api.health().subscribe();
    http.expectOne('/api/health/').flush({ status: 'ok', database: 'ok' });
    expect(store.size).toBe(0);

    store.set('/api/health/', { status: 'ok', database: 'ok' });
    api.health().subscribe({ error: () => (failed = true) });
    failRequest('/api/health/', 502);

    expect(failed).toBe(true);
    expect(connectivity.cacheServedAt()).toBeNull();
  });

  it('no guarda lo que no es una lectura de lotes o pasaportes', () => {
    const client = TestBed.inject(HttpClient);
    api.createLot({ name: 'Lote', geometry: { type: 'Polygon', coordinates: [] } }).subscribe();
    api.createPassport(1).subscribe();
    client.get('/api/events/1/').subscribe();
    client.get('/api/lotsa/').subscribe();
    client.get('/api/lots/1/', { responseType: 'text' }).subscribe();

    http.expectOne({ method: 'POST', url: '/api/lots/' }).flush({ id: 9 });
    http.expectOne({ method: 'POST', url: '/api/lots/1/passport/' }).flush({ token: 'abc' });
    http.expectOne('/api/events/1/').flush({ id: 1 });
    http.expectOne('/api/lotsa/').flush([]);
    http.expectOne('/api/lots/1/').flush('texto');

    expect(store.size).toBe(0);
  });

  it('reconoce la ruta aunque la url venga absoluta', () => {
    TestBed.inject(HttpClient).get('https://lotestigo.example/api/lots/').subscribe();

    http.expectOne('https://lotestigo.example/api/lots/').flush(LOTS);

    expect(store.get('https://lotestigo.example/api/lots/')?.body).toEqual(LOTS);
  });

  it('actualiza la copia cada vez que llega una respuesta nueva', () => {
    store.set('/api/lots/', [], SAVED_AT);

    api.lots().subscribe();
    http.expectOne('/api/lots/').flush(LOTS);

    expect(store.get('/api/lots/')?.body).toEqual(LOTS);
    expect(store.get('/api/lots/')?.savedAt.getTime()).toBeGreaterThan(SAVED_AT.getTime());
  });

  describe('copias por usuario', () => {
    it('guarda los ejemplos públicos y los sirve sin conexión', () => {
      api.exampleLots().subscribe();
      http.expectOne('/api/examples/').flush(LOTS);

      let received: unknown;
      api.exampleLots().subscribe((lots) => (received = lots));
      failRequest('/api/examples/', 0);

      expect(received).toEqual(LOTS);
    });

    it('sin conexión sirve solo la copia de quien ingresó, nunca la de otro', () => {
      store.set('/api/lots/', LOTS, SAVED_AT, 'u8');
      TestBed.inject(AuthSession).start({ token: TEST_TOKEN, user: TEST_USER });

      let error: unknown;
      api.lots().subscribe({ error: (value: unknown) => (error = value) });
      failRequest('/api/lots/', 0);

      expect(error).toBeInstanceOf(HttpErrorResponse);
    });

    it('si la sesión cambia mientras viaja la respuesta, no la guarda a nombre de nadie', () => {
      const session = TestBed.inject(AuthSession);
      session.start({ token: TEST_TOKEN, user: TEST_USER });
      api.lots().subscribe();
      session.end();

      http.expectOne('/api/lots/').flush(LOTS);

      expect(store.get('/api/lots/', 'u7')).toBeNull();
      expect(store.get('/api/lots/')).toBeNull();
      expect(store.size).toBe(0);
    });
  });
});
