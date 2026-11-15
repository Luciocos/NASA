import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { provideSignedInTesting } from '../../../core/auth/testing';
import { provideOfflineTesting } from '../../../core/offline/testing';
import { LoginInvite } from './login-invite';

/** como la ficha de un lote que respondió 404 */
@Component({ imports: [LoginInvite], template: '<app-login-invite />' })
class MissingLot {}

describe('LoginInvite', () => {
  let harness: RouterTestingHarness;
  const el = (): HTMLElement => harness.routeNativeElement!;
  const link = (text: string): HTMLAnchorElement | undefined =>
    [...el().querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent?.trim() === text);

  async function open(url: string, signedIn: boolean): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'lotes/:id', component: MissingLot }]),
        provideHttpClientTesting(),
        signedIn ? provideSignedInTesting() : provideOfflineTesting(),
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, MissingLot);
  }

  it('sin sesión invita a ingresar y vuelve a la misma pantalla', async () => {
    await open('/lotes/5?campania=2026', false);

    expect(el().querySelector('h1')?.textContent?.trim()).toBe('Ingresá para ver este lote');
    expect(el().textContent).toContain('solo los ve la cuenta que los marcó');
    const login = link('Ingresar')!;
    expect(login.classList).toContain('btn--primary');
    const target = TestBed.inject(Router).parseUrl(login.getAttribute('href')!);
    expect(target.root.children['primary'].segments.map((s) => s.path)).toEqual(['ingresar']);
    expect(target.queryParams).toEqual({ volver: '/lotes/5?campania=2026' });
    expect(link('Ver los lotes de ejemplo')?.getAttribute('href')).toBe('/ejemplos');
    expect(link('Ir a mi campo')).toBeUndefined();
  });

  it('al pasar a otro lote, la vuelta sigue a la pantalla nueva', async () => {
    await open('/lotes/5', false);
    await harness.navigateByUrl('/lotes/6');

    expect(link('Ingresar')?.getAttribute('href')).toBe('/ingresar?volver=%2Flotes%2F6');
  });

  it('con sesión dice que no existe o es de otra cuenta y lleva a Mi campo', async () => {
    await open('/lotes/5', true);

    expect(el().querySelector('h1')?.textContent?.trim()).toBe('No encontramos este lote');
    expect(el().textContent).toContain('No existe o es de otra cuenta.');
    const field = link('Ir a mi campo')!;
    expect(field.getAttribute('href')).toBe('/mapa');
    expect(field.classList).toContain('btn--primary');
    expect(link('Ver los lotes de ejemplo')?.getAttribute('href')).toBe('/ejemplos');
    expect(el().querySelector('a[href^="/ingresar"]')).toBeNull();
  });
});
