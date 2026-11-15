import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthUser } from '../models';
import { KeyValueStorage, MemoryStorage, OFFLINE_STORAGE } from '../offline/storage';
import { AUTH_STORAGE_KEY, AuthSession } from './auth-session';
import { AuthService } from './auth.service';
import { TEST_TOKEN, TEST_USER, storeTestSession } from './testing';

// cuentas armadas para la prueba: no son usuarios reales
const OTHER: AuthUser = { id: 8, email: 'otro@ejemplo.com', name: '' };

describe('AuthService', () => {
  let storage: KeyValueStorage;
  let http: HttpTestingController;

  function setup(customStorage?: KeyValueStorage): AuthService {
    storage = customStorage ?? storage;
    TestBed.configureTestingModule({
      providers: [provideHttpClientTesting(), { provide: OFFLINE_STORAGE, useValue: storage }],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('arranca sin sesión', () => {
    const auth = setup();

    expect(auth.user()).toBeNull();
    expect(auth.loggedIn()).toBe(false);
  });

  it('login manda el mail en minúsculas, abre la sesión y la guarda en el dispositivo', () => {
    const auth = setup();
    let user: AuthUser | undefined;

    auth.login('  Productora@Ejemplo.com ', 'clave-segura').subscribe((value) => (user = value));
    const request = http.expectOne({ method: 'POST', url: '/api/auth/login/' });
    expect(request.request.body).toEqual({
      email: 'productora@ejemplo.com',
      password: 'clave-segura',
    });
    request.flush({ token: TEST_TOKEN, user: TEST_USER });

    expect(user).toEqual(TEST_USER);
    expect(auth.user()).toEqual(TEST_USER);
    expect(auth.loggedIn()).toBe(true);
    expect(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)!)).toEqual({
      token: TEST_TOKEN,
      user: TEST_USER,
    });
  });

  it('retoma la sesión guardada al iniciar', () => {
    storeTestSession(storage);
    const auth = setup();

    expect(auth.user()).toEqual(TEST_USER);
    expect(TestBed.inject(AuthSession).token()).toBe(TEST_TOKEN);
  });

  it('ignora una sesión guardada rota o con otra forma', () => {
    storage.setItem(AUTH_STORAGE_KEY, '{"token":"","user":{"id":"7"}}');

    expect(setup().loggedIn()).toBe(false);
  });

  it('register manda el nombre recortado y lo omite si está vacío', () => {
    const auth = setup();

    auth.register({ name: '  Ana ', email: 'ANA@ejemplo.com', password: 'clave' }).subscribe();
    expect(http.expectOne('/api/auth/register/').request.body).toEqual({
      name: 'Ana',
      email: 'ana@ejemplo.com',
      password: 'clave',
    });

    auth.register({ name: '   ', email: 'b@ejemplo.com', password: 'clave' }).subscribe();
    const second = http.expectOne('/api/auth/register/');
    expect(second.request.body).toEqual({ email: 'b@ejemplo.com', password: 'clave' });
    second.flush({ token: 'otro-token', user: OTHER }, { status: 201, statusText: 'Created' });

    expect(auth.user()).toEqual(OTHER);
  });

  it('con credenciales malas propaga el error y no abre la sesión', () => {
    const auth = setup();
    let error: unknown;

    auth.login('ana@ejemplo.com', 'mala').subscribe({ error: (value: unknown) => (error = value) });
    http
      .expectOne('/api/auth/login/')
      .flush({ detail: 'Mail o contraseña incorrectos.' }, { status: 400, statusText: 'Bad' });

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(auth.loggedIn()).toBe(false);
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('una respuesta sin token no abre la sesión', () => {
    const auth = setup();
    let error: unknown;

    auth
      .login('ana@ejemplo.com', 'clave')
      .subscribe({ error: (value: unknown) => (error = value) });
    http.expectOne('/api/auth/login/').flush({ user: TEST_USER });

    expect(error).toBeInstanceOf(Error);
    expect(auth.loggedIn()).toBe(false);
  });

  describe('privacidad en el dispositivo', () => {
    /** lo que deja un usuario en el dispositivo mientras usa la app */
    function storeDataOf(id: number): void {
      storage.setItem(`lotestigo:u${id}:cache:v1:/api/lots/`, '{"t":1,"b":[]}');
      storage.setItem(`lotestigo:u${id}:outbox:v1`, '[]');
      storage.setItem(`lotestigo:u${id}:profit:v1`, '{}');
      storage.setItem(`lotestigo:u${id}:fertilization:v1`, '{}');
    }

    it('logout borra la sesión y todo lo del usuario, y le pide al backend anular el token', () => {
      storeTestSession(storage);
      storeDataOf(7);
      storeDataOf(70);
      storage.setItem('lotestigo:draft:v1', '{}');
      storage.setItem('lotestigo:anon:cache:v1:/api/examples/', '{"t":1,"b":[]}');
      storage.setItem('lotestigo:paint-tutorial:v1', '1');
      const auth = setup();

      auth.logout();

      expect(auth.loggedIn()).toBe(false);
      const left = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      expect(left.sort()).toEqual([
        'lotestigo:anon:cache:v1:/api/examples/',
        'lotestigo:paint-tutorial:v1',
        'lotestigo:u70:cache:v1:/api/lots/',
        'lotestigo:u70:fertilization:v1',
        'lotestigo:u70:outbox:v1',
        'lotestigo:u70:profit:v1',
      ]);
      const revoke = http.expectOne({ method: 'POST', url: '/api/auth/logout/' });
      expect(revoke.request.headers.get('Authorization')).toBe(`Token ${TEST_TOKEN}`);
      revoke.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('sin conexión igual sale: la falla al anular el token no se nota', () => {
      storeTestSession(storage);
      const auth = setup();

      auth.logout();
      http.expectOne('/api/auth/logout/').error(new ProgressEvent('error'));

      expect(auth.loggedIn()).toBe(false);
    });

    it('expire cierra la sesión y borra lo del usuario sin llamar al backend', () => {
      storeTestSession(storage);
      storeDataOf(7);
      const auth = setup();

      auth.expire();

      expect(auth.loggedIn()).toBe(false);
      expect(storage.length).toBe(0);
      http.expectNone('/api/auth/logout/');
    });

    it('si ingresa otra cuenta, borra lo de la anterior y anula su token', () => {
      storeTestSession(storage);
      storeDataOf(7);
      const auth = setup();

      auth.login('otro@ejemplo.com', 'clave').subscribe();
      http.expectOne('/api/auth/login/').flush({ token: 'otro-token', user: OTHER });

      expect(auth.user()).toEqual(OTHER);
      expect(storage.getItem('lotestigo:u7:outbox:v1')).toBeNull();
      const revoke = http.expectOne('/api/auth/logout/');
      expect(revoke.request.headers.get('Authorization')).toBe(`Token ${TEST_TOKEN}`);
      revoke.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('si vuelve a ingresar la misma cuenta, conserva lo suyo', () => {
      storeTestSession(storage);
      storeDataOf(7);
      const auth = setup();

      auth.login('productora@ejemplo.com', 'clave').subscribe();
      http.expectOne('/api/auth/login/').flush({ token: 'token-nuevo', user: TEST_USER });

      expect(storage.getItem('lotestigo:u7:outbox:v1')).toBe('[]');
      expect(TestBed.inject(AuthSession).token()).toBe('token-nuevo');
      http.expectNone('/api/auth/logout/');
    });

    it('borra lo que dejó la cuenta demo de antes de las cuentas', () => {
      storage.setItem('lotestigo:account:v1', '{"id":"demo"}');
      storage.setItem('lotestigo:outbox:v1', '[]');
      storage.setItem('lotestigo:profit:v1', '{}');
      storage.setItem('lotestigo:fertilization:v1', '{}');
      storage.setItem('lotestigo:cache:v1:/api/lots/', '{"t":1,"b":[]}');
      setup();

      expect(storage.length).toBe(0);
    });

    it('userKey da la clave del usuario que ingresó, y null sin sesión', () => {
      storeTestSession(storage);
      const auth = setup();
      const session = TestBed.inject(AuthSession);

      expect(session.userKey('profit:v1')).toBe('lotestigo:u7:profit:v1');
      expect(session.scope()).toBe('u7');
      auth.expire();
      expect(session.userKey('profit:v1')).toBeNull();
      expect(session.scope()).toBe('anon');
    });
  });

  it('sigue a otra pestaña que ingresa o sale', () => {
    const auth = setup();

    storeTestSession(storage);
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY }));
    expect(auth.user()).toEqual(TEST_USER);

    storage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: 'otra-clave' }));
    expect(auth.loggedIn()).toBe(true);
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY }));
    expect(auth.loggedIn()).toBe(false);
  });

  it('con el almacenamiento bloqueado la sesión vive en memoria', () => {
    const blocked: KeyValueStorage = {
      get length(): number {
        throw new DOMException('sin acceso', 'SecurityError');
      },
      key: () => null,
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
    const auth = setup(blocked);

    auth.login('ana@ejemplo.com', 'clave').subscribe();
    http.expectOne('/api/auth/login/').flush({ token: TEST_TOKEN, user: TEST_USER });
    expect(auth.loggedIn()).toBe(true);

    auth.logout();
    http.expectOne('/api/auth/logout/').flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.loggedIn()).toBe(false);
  });
});
