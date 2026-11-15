import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';

import { provideSignedInTesting } from '../../../core/auth/testing';
import {
  CampaignDetail,
  Footprint,
  LandUseDeclaration,
  LotDetail,
  SustainabilityScore,
} from '../../../core/models';
import { provideNasaTesting } from '../../../core/nasa/testing';
import { FertilizationPage } from '../../fertilization/fertilization-page';
import { FootprintPage } from '../../footprint/footprint-page/footprint-page';
import { ProfitPage } from '../../profit/profit-page/profit-page';
import { LotLog } from '../lot-log/lot-log';
import { LotNasa } from '../lot-nasa/lot-nasa';
import { makeEvent } from '../testing';
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

// puntaje armado para la prueba: solo el criterio del uso del suelo, sin dato
const LAND_USE_KEY = 'no_land_use_change_since_2020';
const SCORE: SustainabilityScore = {
  lot: 1,
  provisional: true,
  disclaimer: 'Prueba de concepto: no es una calculadora auditada.',
  score: null,
  max_score: 100,
  weights_defined: true,
  message: null,
  criteria: [
    {
      key: LAND_USE_KEY,
      label: 'Sin cambio de uso del suelo desde 2020',
      status: 'sin_dato',
      status_label: 'Sin dato',
      origin: null,
      reason: 'Motivo de la prueba.',
      evidence: [],
      is_simulated: false,
      hypothetical: false,
      weight: 20,
    },
  ],
  missing_criteria: [LAND_USE_KEY],
  confidence: {
    level: 'SIN DATOS',
    counts: { VERIFIED: 0, DECLARED: 0, ESTIMATED: 0 },
    total: 0,
    rule: 'Regla.',
  },
  uses_simulated_data: false,
};
const DECLARED: LandUseDeclaration = {
  unchanged: true,
  declared_at: '2026-11-15T15:00:00-03:00',
  origin: 'DECLARED',
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
  const button = (label: string) =>
    [...dialog().querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes(label),
    );
  const instance = <T>(type: Type<T>) =>
    fixture.debugElement.query(By.directive(type)).componentInstance as T;

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
    // cada pestaña carga solo lo suyo: Rentabilidad no pide la bitácora del verdor, y usa la
    // ficha del popup en vez de volver a pedirla
    http.expectNone('/api/lots/1/events/');
    http.expectNone('/api/lots/1/');
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
    http.expectNone('/api/lots/1/');

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
    link!.focus();
    link!.click();
    await fixture.whenStable();
    expect(location.path()).toBe('/?lote=1&seccion=practicas');
    expect(tab('Prácticas').getAttribute('aria-selected')).toBe('true');
    // el enlace ya no está: el foco pasa a la pestaña abierta en vez de caer fuera del popup
    expect(document.activeElement).toBe(tab('Prácticas'));
  });

  it('la declaración de uso del suelo sigue a la vista al volver a Prácticas', async () => {
    await router.navigateByUrl('/?lote=1&seccion=practicas');
    await fixture.whenStable();
    await flushLot();
    http.expectOne('/api/lots/1/score/').flush(SCORE);
    await fixture.whenStable();
    button('No cambié')!.click();
    await fixture.whenStable();
    http.expectOne('/api/lots/1/land-use/').flush(DECLARED);
    await fixture.whenStable();
    expect(dialog().textContent).toContain('Declarado por vos');

    tab('Huella').click();
    await fixture.whenStable();
    tab('Prácticas').click();
    await fixture.whenStable();
    http.expectOne('/api/lots/1/score/').flush(SCORE);
    await fixture.whenStable();
    // la ficha del popup ya la tiene: no vuelve a preguntar
    expect(dialog().textContent).toContain('Declarado por vos');
    expect(button('No cambié')).toBeUndefined();
  });

  it('después de declarar en la huella, la ficha se vuelve a pedir sin esqueleto', async () => {
    await router.navigateByUrl('/?lote=1&seccion=huella');
    await fixture.whenStable();
    await flushLot();
    // la huella usa la ficha del popup: no la vuelve a pedir
    http.expectNone('/api/lots/1/');

    instance(FootprintPage).declared.emit({} as Footprint);
    await fixture.whenStable();
    // mientras llega, el popup sigue con la ficha a la vista
    expect(dialog().querySelector('[role="tablist"]')).toBeTruthy();
    const campaign: CampaignDetail = {
      id: 10,
      lot: 1,
      label: '2025/26',
      crop: 'SOY',
      crop_label: 'Soja',
      crop_origin: 'VERIFIED',
      yield_t_ha: 3.1,
      yield_origin: 'DECLARED',
    };
    http.expectOne('/api/lots/1/').flush({ ...LOT, campaigns: [campaign] });
    await fixture.whenStable();

    // la bitácora muestra el rinde nuevo de la campaña
    tab('Bitácora').click();
    await fixture.whenStable();
    expect(instance(LotLog).lot().campaigns).toEqual([campaign]);
  });

  it('un evento revisado en la bitácora llega así a las marcas del verdor', async () => {
    const event = makeEvent();
    const log = { lot: 1, count: 1, message: null, events: [event] };
    await open();
    http.expectOne('/api/lots/1/').flush(LOT);
    await fixture.whenStable();
    http.expectOne('/api/lots/1/events/').flush(log);
    await fixture.whenStable();

    tab('Bitácora').click();
    await fixture.whenStable();
    http.expectOne('/api/lots/1/events/').flush(log);
    await fixture.whenStable();
    instance(LotLog).reviewed.emit({ ...event, origin: 'DECLARED' });

    tab('Satélite').click();
    await fixture.whenStable();
    expect(
      instance(LotNasa)
        .events()
        .map((item) => item.origin),
    ).toEqual(['DECLARED']);
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
