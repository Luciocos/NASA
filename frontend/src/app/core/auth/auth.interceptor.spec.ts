import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { apiCacheInterceptor } from '../offline/api-cache.interceptor';
import { ApiCacheStore } from '../offline/api-cache-store';
import { MemoryStorage, OFFLINE_STORAGE } from '../offline/storage';
import { AuthSession } from './auth-session';
import { authInterceptor } from './auth.interceptor';
import { TEST_TOKEN, TEST_USER, storeTestSession } from './testing';

@Component({ template: '' })
class Blank {}

const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };
const NOT_VALID = { detail: 'Token inválido.' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let session: AuthSession;
  let router: Router;
  let storage: MemoryStorage;
  let navigations: string[];

  async function setup({ signedIn = true, at = '/lotes/5' } = {}): Promise<void> {
    storage = new MemoryStorage();
    if (signedIn) storeTestSession(storage);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'lotes/:id', component: Blank },
          { path: 'ingresar', component: Blank },
          { path: 'mapa', component: Blank },
        ]),
        provideHttpClient(withInterceptors([authInterceptor, apiCacheInterceptor])),
        provideHttpClientTesting(),
        { provide: OFFLINE_STORAGE, useValue: storage },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSession);
    router = TestBed.inject(Router);
    await router.navigateByUrl(at);
    navigations = [];
    vi.spyOn(router, 'navigateByUrl').mockImplementation((url: string | UrlTree) => {
      navigations.push(typeof url === 'string' ? url : router.serializeUrl(url));
      return Promise.resolve(true);
    });
  }

  const authorization = (request: TestRequest): string | null =>
    request.request.headers.get('Authorization');

  afterEach(() => {
    backend.verify();
    vi.restoreAllMocks();
  });

  it('firma los pedidos a /api/ con el token de la sesión', async () => {
    await setup();
    http.get('/api/lots/').subscribe();
    http.post('/api/lots/5/declaration/', {}).subscribe();

    expect(authorization(backend.expectOne('/api/lots/'))).toBe(`Token ${TEST_TOKEN}`);
    expect(authorization(backend.expectOne('/api/lots/5/declaration/'))).toBe(
      `Token ${TEST_TOKEN}`,
    );
  });

  it('nunca le manda el token a otro sitio, aunque su ruta empiece con /api/', async () => {
    await setup();
    const nasa = 'https://power.larc.nasa.gov/api/temporal/daily/point?latitude=-33';
    http.get(nasa).subscribe();
    http.get('//otro.sitio/api/lots/').subscribe();
    http.get('/media/evidence/lote1.png', { responseType: 'blob' }).subscribe();

    expect(authorization(backend.expectOne(nasa))).toBeNull();
    expect(authorization(backend.expectOne('//otro.sitio/api/lots/'))).toBeNull();
    expect(authorization(backend.expectOne('/media/evidence/lote1.png'))).toBeNull();
  });

  it('firma una url absoluta solo si es de este mismo sitio', async () => {
    await setup();
    const own = `${window.location.origin}/api/examples/`;
    http.get(own).subscribe();

    expect(authorization(backend.expectOne(own))).toBe(`Token ${TEST_TOKEN}`);
  });

  it('sin sesión no agrega nada', async () => {
    await setup({ signedIn: false });
    http.get('/api/examples/').subscribe();

    expect(authorization(backend.expectOne('/api/examples/'))).toBeNull();
  });

  it('no pisa un encabezado Authorization que ya trae el pedido', async () => {
    await setup();
    http.post('/api/auth/logout/', null, { headers: { Authorization: 'Token otro' } }).subscribe();

    expect(authorization(backend.expectOne('/api/auth/logout/'))).toBe('Token otro');
  });

  it('ingresar y crear la cuenta van sin token; salir y "me" lo llevan', async () => {
    await setup();
    http.post('/api/auth/login/', {}).subscribe();
    http.post('/api/auth/register/', {}).subscribe();
    http.get('/api/auth/me/').subscribe();

    expect(authorization(backend.expectOne('/api/auth/login/'))).toBeNull();
    expect(authorization(backend.expectOne('/api/auth/register/'))).toBeNull();
    expect(authorization(backend.expectOne('/api/auth/me/'))).toBe(`Token ${TEST_TOKEN}`);
  });

  it('con un 401 cierra la sesión, borra lo del usuario y lleva a ingresar', async () => {
    await setup();
    storage.setItem('lotestigo:u7:outbox:v1', '[]');
    let failed = false;
    http.get('/api/lots/').subscribe({ error: () => (failed = true) });

    backend.expectOne('/api/lots/').flush(NOT_VALID, UNAUTHORIZED);
    // la lectura se repite sin el token vencido: sin sesión también responde 401
    const retry = backend.expectOne('/api/lots/');
    expect(authorization(retry)).toBeNull();
    retry.flush({ detail: 'Faltan credenciales.' }, UNAUTHORIZED);

    expect(failed).toBe(true);
    expect(session.user()).toBeNull();
    expect(storage.getItem('lotestigo:u7:outbox:v1')).toBeNull();
    expect(navigations).toEqual(['/ingresar?volver=%2Flotes%2F5']);
  });

  it('con un token vencido, lo público sigue andando sin sesión y sin redirigir', async () => {
    await setup();
    let received: unknown;
    http.get('/api/examples/').subscribe((body) => (received = body));

    backend.expectOne('/api/examples/').flush(NOT_VALID, UNAUTHORIZED);
    backend.expectOne('/api/examples/').flush([{ id: 1 }]);

    expect(received).toEqual([{ id: 1 }]);
    expect(session.user()).toBeNull();
    expect(navigations).toEqual([]);
    // la copia de lo público queda a nombre de nadie, no del usuario que salió
    expect(TestBed.inject(ApiCacheStore).get('/api/examples/', 'anon')?.body).toEqual([{ id: 1 }]);
  });

  it('con varias lecturas en paralelo y el token vencido, todas se repiten sin él', async () => {
    await setup();
    const received: unknown[] = [];
    http.get('/api/lots/5/').subscribe((body) => received.push(body));
    http.get('/api/lots/5/events/').subscribe((body) => received.push(body));

    backend.expectOne('/api/lots/5/').flush(NOT_VALID, UNAUTHORIZED);
    backend.expectOne('/api/lots/5/events/').flush(NOT_VALID, UNAUTHORIZED);
    backend.expectOne('/api/lots/5/').flush({ id: 5 });
    backend.expectOne('/api/lots/5/events/').flush({ events: [] });

    expect(received).toEqual([{ id: 5 }, { events: [] }]);
    expect(session.user()).toBeNull();
    expect(navigations).toEqual([]);
  });

  it('una escritura con 401 no se repite: cierra la sesión y lleva a ingresar', async () => {
    await setup();
    http.patch('/api/events/3/', { confirm: true }).subscribe({ error: () => undefined });

    backend.expectOne('/api/events/3/').flush(NOT_VALID, UNAUTHORIZED);

    expect(session.user()).toBeNull();
    expect(navigations).toEqual(['/ingresar?volver=%2Flotes%2F5']);
  });

  it('sin sesión, un 401 lleva a ingresar con la ruta para volver', async () => {
    await setup({ signedIn: false, at: '/mapa' });
    http.get('/api/lots/').subscribe({ error: () => undefined });

    backend.expectOne('/api/lots/').flush({ detail: 'Faltan credenciales.' }, UNAUTHORIZED);

    expect(navigations).toEqual(['/ingresar?volver=%2Fmapa']);
  });

  it('en las pantallas de ingreso no redirige otra vez', async () => {
    await setup({ signedIn: false, at: '/ingresar' });
    http.get('/api/lots/').subscribe({ error: () => undefined });

    backend.expectOne('/api/lots/').flush({ detail: 'Faltan credenciales.' }, UNAUTHORIZED);

    expect(navigations).toEqual([]);
  });

  it('un 401 de /api/auth/ no toca la sesión ni redirige', async () => {
    await setup();
    http.get('/api/auth/me/').subscribe({ error: () => undefined });

    backend.expectOne('/api/auth/me/').flush(NOT_VALID, UNAUTHORIZED);

    expect(session.user()).toEqual(TEST_USER);
    expect(navigations).toEqual([]);
  });

  it('si la sesión cambió mientras viajaba el pedido, el 401 viejo no cierra la nueva', async () => {
    await setup();
    http.get('/api/lots/').subscribe({ error: () => undefined });
    session.start({ token: 'token-nuevo', user: { ...TEST_USER, id: 9 } });

    backend.expectOne('/api/lots/').flush(NOT_VALID, UNAUTHORIZED);

    expect(session.token()).toBe('token-nuevo');
    expect(navigations).toEqual([]);
  });

  it('otros errores pasan sin tocar la sesión', async () => {
    await setup();
    http.get('/api/lots/12/').subscribe({ error: () => undefined });

    backend
      .expectOne('/api/lots/12/')
      .flush({ detail: 'No encontrado.' }, { status: 404, statusText: 'Not Found' });

    expect(session.user()).toEqual(TEST_USER);
    expect(navigations).toEqual([]);
  });
});
