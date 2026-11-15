import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  GuardResult,
  MaybeAsync,
  Router,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';

import { provideOfflineTesting } from '../offline/testing';
import { authGuard, guestGuard } from './auth.guard';
import { loginUrl, safeReturnUrl } from './return-url';
import { provideSignedInTesting } from './testing';

describe('authGuard y guestGuard', () => {
  function setup(signedIn: boolean): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        signedIn ? provideSignedInTesting() : provideOfflineTesting(),
      ],
    });
  }

  /** corre el guard y devuelve true, o la ruta a la que redirige */
  function run(
    guard: typeof authGuard,
    url: string,
    query: Record<string, string> = {},
  ): true | string {
    const route = { queryParamMap: convertToParamMap(query) } as ActivatedRouteSnapshot;
    const state = { url } as RouterStateSnapshot;
    const result: MaybeAsync<GuardResult> = TestBed.runInInjectionContext(() =>
      guard(route, state),
    );
    if (result === true) return true;
    if (result instanceof UrlTree) return TestBed.inject(Router).serializeUrl(result);
    throw new Error(`resultado inesperado: ${String(result)}`);
  }

  it('authGuard deja pasar a quien ingresó', () => {
    setup(true);

    expect(run(authGuard, '/mapa/nuevo')).toBe(true);
  });

  it('authGuard lleva a ingresar con la ruta a la que volver', () => {
    setup(false);

    expect(run(authGuard, '/mapa/nuevo')).toBe('/ingresar?volver=%2Fmapa%2Fnuevo');
    expect(run(authGuard, '/mapa')).toBe('/ingresar?volver=%2Fmapa');
  });

  it('guestGuard muestra las pantallas de ingreso sin sesión', () => {
    setup(false);

    expect(run(guestGuard, '/ingresar')).toBe(true);
  });

  it('guestGuard manda a quien ya ingresó a ?volver= o a Mi campo', () => {
    setup(true);

    expect(run(guestGuard, '/ingresar')).toBe('/mapa');
    expect(run(guestGuard, '/ingresar', { volver: '/lotes/3' })).toBe('/lotes/3');
    expect(run(guestGuard, '/ingresar', { volver: '//otro.sitio' })).toBe('/mapa');
  });
});

describe('safeReturnUrl y loginUrl', () => {
  it('acepta solo rutas internas que no sean de ingreso', () => {
    expect(safeReturnUrl('/lotes/3?tab=huella')).toBe('/lotes/3?tab=huella');
    expect(safeReturnUrl('/')).toBe('/');
    for (const bad of [
      null,
      42,
      '',
      'lotes/3',
      '//otro.sitio/x',
      '/\\otro.sitio',
      'https://otro.sitio/',
      '/ingresar?volver=/mapa',
      '/registrarse',
    ]) {
      expect(safeReturnUrl(bad)).toBeNull();
    }
  });

  it('loginUrl omite volver para la landing y para lo que no sirve', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    const url = (back: string | null): string => router.serializeUrl(loginUrl(router, back));

    expect(url('/huella/2')).toBe('/ingresar?volver=%2Fhuella%2F2');
    expect(url('/')).toBe('/ingresar');
    expect(url(null)).toBe('/ingresar');
    expect(url('/ingresar')).toBe('/ingresar');
  });
});
