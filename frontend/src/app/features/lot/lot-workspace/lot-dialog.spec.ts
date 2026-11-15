import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';

import { provideSignedInTesting } from '../../../core/auth/testing';
import { LotDetail } from '../../../core/models';
import { provideNasaTesting } from '../../../core/nasa/testing';
import { FertilizationPage } from '../../fertilization/fertilization-page';
import { ProfitPage } from '../../profit/profit-page/profit-page';
import { LotDialog } from './lot-dialog';
import { openLot } from './lot-link';

// lote armado para la prueba: no representa un lote real
const LOT: LotDetail = {
  id: 1,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 24.94,
  event_count: 0,
  created_at: '2026-11-14T10:00:00Z',
  is_example: false,
  owned: true,
  campaigns: [],
};

@Component({
  imports: [LotDialog],
  template: `<button id="opener" type="button">Ver lote</button><app-lot-dialog />`,
})
class Host {}

describe('LotDialog', () => {
  let fixture: ComponentFixture<Host>;
  let http: HttpTestingController;
  let router: Router;
  let location: Location;
  const el = () => fixture.nativeElement as HTMLElement;
  const dialog = () => el().querySelector<HTMLDialogElement>('dialog.lot-dialog')!;
  const isOpen = () => dialog().hasAttribute('open');
  const tab = (label: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent?.trim() === label,
    )!;
  const closeButton = () =>
    [...dialog().querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.trim() === 'Cerrar',
    )!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRouter([]),
        provideLocationMocks(),
        ...provideNasaTesting(),
        ...provideSignedInTesting(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    // como al arrancar la app: el router escucha atrás y adelante
    router.initialNavigation();
    fixture = TestBed.createComponent(Host);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    await router.navigateByUrl('/');
  });

  afterEach(() => document.documentElement.style.removeProperty('overflow'));

  /** responde la ficha del popup (y, en Satélite, la bitácora de las marcas del verdor) */
  async function flushLot(lot: LotDetail = LOT): Promise<void> {
    http.expectOne(`/api/lots/${lot.id}/`).flush(lot);
    await fixture.whenStable();
    for (const request of http.match(`/api/lots/${lot.id}/events/`)) {
      request.flush({ lot: lot.id, count: 0, message: null, events: [] });
    }
    await fixture.whenStable();
  }

  async function open(lotId = 1): Promise<void> {
    openLot(router, lotId);
    await fixture.whenStable();
  }

  /** atrás y adelante llegan al router en otra vuelta del navegador (popstate) */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  it('cerrado no muestra nada y la pantalla se desplaza como siempre', () => {
    expect(isOpen()).toBe(false);
    expect(dialog().querySelector('app-lot-workspace')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('un enlace con ?lote= y ?seccion= abre el popup en esa pestaña, con el lote de nombre', async () => {
    await router.navigateByUrl('/?lote=1&seccion=rentabilidad');
    await fixture.whenStable();
    expect(isOpen()).toBe(true);
    // la pantalla de atrás no se desplaza mientras está abierto
    expect(document.documentElement.style.overflow).toBe('hidden');
    await flushLot();

    expect(dialog().getAttribute('aria-labelledby')).toBe('lot-title-1');
    expect(dialog().querySelector('#lot-title-1')?.textContent?.trim()).toBe('Lote de prueba');
    expect(dialog().querySelector('.meta')?.textContent?.trim()).toBe(
      '24,9 ha · Casilda, Santa Fe',
    );
    expect(tab('Rentabilidad').getAttribute('aria-selected')).toBe('true');
    const panel = dialog().querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute('aria-labelledby')).toBe(tab('Rentabilidad').id);
    expect(tab('Rentabilidad').getAttribute('aria-controls')).toBe(panel?.id);
    const profit = fixture.debugElement.query(By.directive(ProfitPage))
      .componentInstance as ProfitPage;
    expect(profit.embedded()).toBe(true);
    expect(profit.id()).toBe(1);
    // cada pestaña carga solo lo suyo: Rentabilidad no pide la bitácora del verdor
    http.expectNone('/api/lots/1/events/');
  });

  it('al llegar la ficha, el foco queda adentro: en la pestaña abierta', async () => {
    await open();
    // showModal deja el foco en el primer botón: el Cerrar mientras carga
    closeButton().focus();
    await flushLot();
    expect(document.activeElement).toBe(tab('Satélite'));
  });

  it('cambiar de pestaña reemplaza la dirección: atrás cierra el popup', async () => {
    await open();
    expect(location.path()).toBe('/?lote=1');
    await flushLot();
    expect(tab('Satélite').getAttribute('aria-selected')).toBe('true');
    expect(dialog().querySelector('app-lot-nasa')).toBeTruthy();

    tab('Fertilización').click();
    await fixture.whenStable();
    expect(location.path()).toBe('/?lote=1&seccion=fertilizacion');
    expect(dialog().querySelector('app-lot-nasa')).toBeNull();
    const fertilization = fixture.debugElement.query(By.directive(FertilizationPage))
      .componentInstance as FertilizationPage;
    expect(fertilization.embedded()).toBe(true);
    expect(fertilization.id()).toBe(1);

    location.back();
    await settle();
    expect(location.path()).toBe('/');
    expect(isOpen()).toBe(false);
  });

  it('Escape lo cierra, vuelve atrás y el foco vuelve a donde estaba', async () => {
    const opener = el().querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    await open();
    await flushLot();
    closeButton().focus();

    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    await settle();

    expect(cancel.defaultPrevented).toBe(true);
    expect(location.path()).toBe('/');
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('Cerrar lo cierra; un enlace pegado se cierra sacando el lote de la dirección', async () => {
    await open();
    await flushLot();
    closeButton().click();
    await settle();
    expect(isOpen()).toBe(false);
    expect(location.path()).toBe('/');

    // sin la entrada que suma la app, cerrar no vuelve atrás: reemplaza la dirección
    await router.navigateByUrl('/?lote=1&seccion=huella&vista=desglose');
    await fixture.whenStable();
    const back = vi.spyOn(location, 'back');
    closeButton().click();
    await settle();
    expect(back).not.toHaveBeenCalled();
    expect(location.path()).toBe('/');
    expect(isOpen()).toBe(false);
  });

  it('un enlace del contenido a otra pestaña de este lote no sale del popup', async () => {
    await open();
    await flushLot();
    const link = dialog().querySelector<HTMLAnchorElement>('a[href="/lotes/1/practicas"]');
    expect(link).toBeTruthy();
    link!.click();
    await fixture.whenStable();
    expect(location.path()).toBe('/?lote=1&seccion=practicas');
    expect(tab('Prácticas').getAttribute('aria-selected')).toBe('true');
  });

  it('en un lote propio el menú ⋯ comparte el pasaporte; un ejemplo es de solo lectura', async () => {
    await open();
    await flushLot();
    expect(dialog().querySelector('app-more-menu button')?.getAttribute('aria-label')).toBe(
      'Más opciones del lote',
    );
    expect(dialog().textContent).toContain('Compartir pasaporte');
    expect(dialog().textContent).not.toContain('solo lectura');

    closeButton().click();
    await settle();
    await open(2);
    await flushLot({ ...LOT, id: 2, is_example: true, owned: false });
    expect(dialog().querySelector('.example')?.textContent).toContain(
      'Lote de ejemplo · solo lectura',
    );
    expect(dialog().querySelector('app-more-menu')).toBeNull();
    // en el popup no hay vuelta a Mi campo: se cierra
    expect(dialog().querySelector('a.back')).toBeNull();
    expect(closeButton()).toBeTruthy();
  });

  it('un lote que no existe o es de otra cuenta invita a ingresar y deja cerrar', async () => {
    await open(99);
    http.expectOne('/api/lots/99/').flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(dialog().querySelector('app-login-invite')).toBeTruthy();
    expect(dialog().querySelector('[role="tablist"]')).toBeNull();

    closeButton().click();
    await settle();
    expect(isOpen()).toBe(false);
  });
});
