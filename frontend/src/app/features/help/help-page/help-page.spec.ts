import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { provideSignedInTesting } from '../../../core/auth/testing';
import { provideOfflineTesting } from '../../../core/offline/testing';
import { HelpPage } from './help-page';

@Component({ template: '' })
class Blank {}

describe('HelpPage', () => {
  let fixture: ComponentFixture<HelpPage>;
  let router: Router;
  const el = () => fixture.nativeElement as HTMLElement;
  const step = () => el().querySelector('figure')!.getAttribute('data-step');

  async function setup(url: string, signedIn: boolean): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [HelpPage],
      providers: [
        provideRouter([
          { path: 'ayuda', component: HelpPage },
          { path: 'mapa', component: Blank },
          { path: 'registrarse', component: Blank },
        ]),
        provideHttpClientTesting(),
        signedIn ? provideSignedInTesting() : provideOfflineTesting(),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(HelpPage);
    await fixture.whenStable();
  }

  /** toca Listo y devuelve a dónde fue */
  async function finish(): Promise<unknown> {
    const navigate = vi.spyOn(router, 'navigateByUrl');
    el().querySelector<HTMLButtonElement>('button.next')!.click();
    await fixture.whenStable();
    return navigate.mock.calls[0]?.[0];
  }

  it('es la misma guía como página, nombrada por su título y sin pedir cuenta', async () => {
    await setup('/ayuda', false);
    const title = el().querySelector('h1')!;
    expect(title.textContent!.trim()).toBe('Cómo cargar tus datos');
    expect(el().querySelector('section')!.getAttribute('aria-labelledby')).toBe(title.id);
    expect(step()).toBe('marcar');
    // en la página no hay X: no hay nada que cerrar
    expect(el().textContent).not.toContain('Cerrar la ayuda');
  });

  it('?paso= abre en ese paso, para compartir uno en particular', async () => {
    await setup('/ayuda?paso=rentabilidad', false);
    expect(step()).toBe('rentabilidad');
  });

  it('Listo lleva a crear la cuenta si no hay sesión', async () => {
    await setup('/ayuda?paso=pasaporte', false);
    expect(await finish()).toBe('/registrarse');
  });

  it('Listo lleva a Mi campo si ya ingresó', async () => {
    await setup('/ayuda?paso=pasaporte', true);
    expect(await finish()).toBe('/mapa');
  });
});
