import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthService } from '../../../core/auth/auth.service';
import { TEST_TOKEN, TEST_USER } from '../../../core/auth/testing';
import { provideOfflineTesting } from '../../../core/offline/testing';
import { RegisterPage } from './register-page';

@Component({ template: '' })
class Blank {}

const CREATED = { status: 201, statusText: 'Created' };
const BAD_REQUEST = { status: 400, statusText: 'Bad Request' };

describe('RegisterPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  const el = (): HTMLElement => harness.routeNativeElement!;
  const input = (id: string): HTMLInputElement => el().querySelector<HTMLInputElement>(`#${id}`)!;

  async function open(url = '/registrarse'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'registrarse', component: RegisterPage },
          { path: '**', component: Blank },
        ]),
        provideHttpClientTesting(),
        provideOfflineTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, RegisterPage);
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

  afterEach(() => http.verify());

  it('pide nombre opcional, mail y contraseña, con la ayuda de la contraseña a la vista', async () => {
    await open('/registrarse?volver=%2Fejemplos');

    expect(el().querySelector('h1')?.textContent).toContain('Create your free account');
    expect(el().querySelector('label[for="register-name"]')?.textContent).toContain('(optional)');
    expect(input('register-password').autocomplete).toBe('new-password');
    expect(input('register-password').getAttribute('aria-describedby')).toBe(
      'register-password-hint',
    );
    expect(el().textContent).toContain(
      'Your fields and your data are private: only you can see them.',
    );
    expect(el().querySelector('a[href^="/ingresar"]')?.getAttribute('href')).toBe(
      '/ingresar?volver=%2Fejemplos',
    );
  });

  it('crea la cuenta, abre la sesión y va a Mi campo', async () => {
    await open();
    await type('register-name', ' Ana ');
    await type('register-email', 'ana@ejemplo.com');
    await type('register-password', 'una-clave-larga');
    await submit();

    const request = http.expectOne({ method: 'POST', url: '/api/auth/register/' });
    expect(request.request.body).toEqual({
      name: 'Ana',
      email: 'ana@ejemplo.com',
      password: 'una-clave-larga',
    });
    request.flush({ token: TEST_TOKEN, user: TEST_USER }, CREATED);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/mapa');
    expect(TestBed.inject(AuthService).loggedIn()).toBe(true);
  });

  it('muestra los errores del backend debajo de cada campo y enfoca el primero', async () => {
    await open();
    await type('register-email', 'ana@ejemplo.com');
    await type('register-password', '12345678');
    await submit();

    http.expectOne('/api/auth/register/').flush(
      {
        email: ['Ya hay una cuenta con ese mail.'],
        password: ['Esta contraseña es completamente numérica.'],
      },
      BAD_REQUEST,
    );
    await harness.fixture.whenStable();

    expect(el().querySelector('#register-email-error')?.textContent).toContain(
      'Ya hay una cuenta con ese mail.',
    );
    expect(el().querySelector('#register-password-error')?.textContent).toContain(
      'completamente numérica',
    );
    expect(input('register-password').getAttribute('aria-describedby')).toBe(
      'register-password-hint register-password-error',
    );
    expect(document.activeElement).toBe(input('register-email'));
    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(TestBed.inject(AuthService).loggedIn()).toBe(false);
  });

  it('sin contraseña no llama al backend', async () => {
    await open();
    await type('register-email', 'ana@ejemplo.com');
    await submit();

    expect(el().querySelector('#register-password-error')?.textContent).toContain(
      'Choose a password.',
    );
    expect(document.activeElement).toBe(input('register-password'));
    http.expectNone('/api/auth/register/');
  });

  it('un error del servidor sin detalle se explica en general', async () => {
    await open();
    await type('register-email', 'ana@ejemplo.com');
    await type('register-password', 'una-clave-larga');
    await submit();

    http
      .expectOne('/api/auth/register/')
      .flush('<html>error</html>', { status: 500, statusText: 'Server Error' });
    await harness.fixture.whenStable();

    const alert = el().querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain("Couldn't sign up (error 500).");
    expect(alert).not.toContain('<html>');
  });
});
