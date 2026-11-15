import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthService } from '../../../core/auth/auth.service';
import { TEST_TOKEN, TEST_USER } from '../../../core/auth/testing';
import { BackendStatus, Connectivity } from '../../../core/offline/connectivity';
import { provideOfflineTesting } from '../../../core/offline/testing';
import { LoginPage } from './login-page';

@Component({ template: '' })
class Blank {}

const BAD_REQUEST = { status: 400, statusText: 'Bad Request' };

describe('LoginPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  const el = (): HTMLElement => harness.routeNativeElement!;
  const input = (id: string): HTMLInputElement => el().querySelector<HTMLInputElement>(`#${id}`)!;
  const submitButton = (): HTMLButtonElement =>
    el().querySelector<HTMLButtonElement>('button[type="submit"]')!;

  async function open(
    url = '/ingresar?volver=%2Flotes%2F3',
    connectivity?: { online: boolean; backend: BackendStatus },
  ): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'ingresar', component: LoginPage },
          { path: '**', component: Blank },
        ]),
        provideHttpClientTesting(),
        provideOfflineTesting(),
        connectivity
          ? {
              provide: Connectivity,
              useValue: {
                online: signal(connectivity.online),
                backend: signal(connectivity.backend),
              },
            }
          : [],
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, LoginPage);
  }

  async function type(id: string, value: string): Promise<void> {
    const field = input(id);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
  }

  async function submit(): Promise<void> {
    el()
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await harness.fixture.whenStable();
  }

  async function fillAndSubmit(): Promise<void> {
    await type('login-email', 'Productora@Ejemplo.com');
    await type('login-password', 'clave-segura');
    await submit();
  }

  afterEach(() => http.verify());

  it('muestra una tarjeta simple con la nota de privacidad y el enlace a crear la cuenta', async () => {
    await open();

    expect(el().querySelector('h1')?.textContent).toContain('Ingresá a tu cuenta');
    expect(el().textContent).toContain('Tus lotes y tus datos son privados: solo vos los ves.');
    const register = el().querySelector<HTMLAnchorElement>('a[href^="/registrarse"]');
    expect(register?.getAttribute('href')).toBe('/registrarse?volver=%2Flotes%2F3');
    expect(el().querySelector('a[href="/ejemplos"]')).not.toBeNull();
    expect(el().querySelector('.alert')).toBeNull();
  });

  it('sin mail ni contraseña marca los campos, enfoca el primero y no llama al backend', async () => {
    await open();

    await submit();

    expect(el().querySelector('#login-email-error')?.textContent).toContain('Escribí tu mail.');
    expect(el().querySelector('#login-password-error')?.textContent).toContain(
      'Escribí tu contraseña.',
    );
    expect(input('login-email').getAttribute('aria-invalid')).toBe('true');
    expect(input('login-email').getAttribute('aria-describedby')).toBe('login-email-error');
    expect(document.activeElement).toBe(input('login-email'));
    http.expectNone('/api/auth/login/');

    // al corregir el campo, su error se va
    await type('login-email', 'ana@');
    expect(el().querySelector('#login-email-error')).toBeNull();
  });

  it('avisa si el mail está mal escrito', async () => {
    await open();
    await type('login-email', 'ana.ejemplo.com');
    await type('login-password', 'clave');

    await submit();

    expect(el().querySelector('#login-email-error')?.textContent).toContain(
      'tiene que ser como nombre@ejemplo.com',
    );
    http.expectNone('/api/auth/login/');
  });

  it('ingresa y vuelve a la ruta de ?volver=', async () => {
    await open();
    await fillAndSubmit();

    expect(submitButton().textContent).toContain('Ingresando…');
    expect(submitButton().getAttribute('aria-disabled')).toBe('true');
    const request = http.expectOne({ method: 'POST', url: '/api/auth/login/' });
    expect(request.request.body).toEqual({
      email: 'productora@ejemplo.com',
      password: 'clave-segura',
    });
    request.flush({ token: TEST_TOKEN, user: TEST_USER });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/lotes/3');
    expect(TestBed.inject(AuthService).user()).toEqual(TEST_USER);
  });

  it('sin ?volver= va a Mi campo', async () => {
    await open('/ingresar');
    await fillAndSubmit();

    http.expectOne('/api/auth/login/').flush({ token: TEST_TOKEN, user: TEST_USER });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/mapa');
  });

  it('muestra el error del backend y deja volver a intentar', async () => {
    await open();
    await fillAndSubmit();

    http
      .expectOne('/api/auth/login/')
      .flush({ detail: 'Mail o contraseña incorrectos.' }, BAD_REQUEST);
    await harness.fixture.whenStable();

    const alert = el().querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Mail o contraseña incorrectos.');
    expect(submitButton().textContent).toContain('Ingresar');
    expect(submitButton().hasAttribute('aria-disabled')).toBe(false);
    expect(TestBed.inject(AuthService).loggedIn()).toBe(false);
  });

  it('con demasiados intentos explica que hay que esperar', async () => {
    await open();
    await fillAndSubmit();

    http.expectOne('/api/auth/login/').flush(null, { status: 429, statusText: 'Too Many' });
    await harness.fixture.whenStable();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Esperá un minuto');
  });

  it('si no llega al servidor lo dice en lenguaje llano', async () => {
    await open();
    await fillAndSubmit();

    http.expectOne('/api/auth/login/').error(new ProgressEvent('error'));
    await harness.fixture.whenStable();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos conectar con el servidor.',
    );
  });

  it('sin conexión avisa que para ingresar hace falta internet', async () => {
    await open('/ingresar', { online: false, backend: 'down' });

    expect(el().querySelector('.alert--warn')?.textContent).toContain(
      'Para ingresar hace falta internet.',
    );
  });

  it('mostrar contraseña cambia el tipo del campo', async () => {
    await open();
    const toggle = el().querySelector<HTMLButtonElement>('.password__toggle')!;
    expect(input('login-password').type).toBe('password');
    expect(toggle.textContent).toContain('Mostrar contraseña');

    toggle.click();
    await harness.fixture.whenStable();

    expect(input('login-password').type).toBe('text');
    expect(toggle.textContent).toContain('Ocultar contraseña');
  });
});
