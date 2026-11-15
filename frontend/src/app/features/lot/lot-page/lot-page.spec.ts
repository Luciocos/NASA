import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { provideSignedInTesting } from '../../../core/auth/testing';
import { LotDetail } from '../../../core/models';
import { provideNasaTesting } from '../../../core/nasa/testing';
import { LotTabKey } from '../../../shared/ui/lot-tabs/lot-tabs';
import { LotLog } from '../lot-log/lot-log';
import { LotNasa } from '../lot-nasa/lot-nasa';
import { makeEvent } from '../testing';
import { LotPage } from './lot-page';

// Lote armado para la prueba: no representa un lote real.
const LOT: LotDetail = {
  id: 1,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 24.94,
  event_count: 1,
  created_at: '2026-11-14T10:00:00Z',
  is_example: false,
  owned: true,
  campaigns: [],
};

const EXAMPLE: LotDetail = { ...LOT, is_example: true, owned: false };

describe('LotPage', () => {
  let fixture: ComponentFixture<LotPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

  /** la página de una ruta del lote: el :id y la pestaña de data.tab */
  async function setup(tab: LotTabKey = 'satellite'): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [LotPage],
      providers: [
        provideRouter([]),
        ...provideNasaTesting(),
        ...provideSignedInTesting(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: '1' })), data: of({ tab }) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LotPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  }

  async function load(lot: LotDetail): Promise<void> {
    http.expectOne('/api/lots/1/').flush(lot);
    await fixture.whenStable();
  }

  it('como página muestra el encabezado del lote, las pestañas como enlaces y Satélite', async () => {
    await setup();
    await load(LOT);
    // la pestaña Satélite pide la bitácora solo para marcar los eventos en el verdor
    http
      .expectOne('/api/lots/1/events/')
      .flush({ lot: 1, count: 1, message: null, events: [makeEvent()] });
    await fixture.whenStable();

    expect(el().querySelector('app-lot-tabs h1')?.textContent?.trim()).toBe('Lote de prueba');
    expect(el().querySelector('app-lot-tabs .meta')?.textContent?.trim()).toBe(
      '24.9 ha · Casilda, Santa Fe',
    );
    expect(el().querySelector('app-lot-tabs a.back')?.getAttribute('href')).toBe('/mapa');
    const current = el().querySelector('nav a[aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Satellite');
    expect(current?.getAttribute('href')).toBe('/lotes/1');
    const nasa = fixture.debugElement.query(By.directive(LotNasa));
    expect((nasa.componentInstance as LotNasa).events().map((event) => event.id)).toEqual([1]);
    expect(text()).toContain('What the satellite sees');
  });

  it('la pestaña sale de la ruta: en Bitácora no pide nada de Satélite', async () => {
    await setup('log');
    await load(LOT);

    expect(el().querySelector('nav a[aria-current="page"]')?.textContent?.trim()).toBe('Field log');
    expect(el().querySelector('app-lot-nasa')).toBeNull();
    const log = fixture.debugElement.query(By.directive(LotLog));
    expect((log.componentInstance as LotLog).editable()).toBe(true);
  });

  it('en /lotes/:id/pasaporte abre la pestaña Pasaporte, también en un ejemplo', async () => {
    await setup('passport');
    await load(EXAMPLE);

    const current = el().querySelector('nav a[aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Passport');
    expect(current?.getAttribute('href')).toBe('/lotes/1/pasaporte');
    expect(el().querySelector('app-more-menu')).toBeNull();
    button('Share passport')?.click();
    expect(http.expectOne('/api/lots/1/passport/').request.method).toBe('POST');
  });

  it('en un ejemplo avisa que es de solo lectura, vuelve a Ejemplos y no deja escribir', async () => {
    await setup('log');
    await load(EXAMPLE);

    expect(el().querySelector('.example')?.textContent).toContain('Sample field · read-only');
    expect(el().querySelector('app-more-menu')).toBeNull();
    const back = el().querySelector('app-lot-tabs a.back');
    expect(back?.textContent).toContain('Examples');
    expect(back?.getAttribute('href')).toBe('/ejemplos');
    const log = fixture.debugElement.query(By.directive(LotLog));
    expect((log.componentInstance as LotLog).editable()).toBe(false);
  });

  it('si el lote no existe o es de otra cuenta, invita a ingresar', async () => {
    await setup();
    http.expectOne('/api/lots/1/').flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(el().querySelector('app-login-invite')).toBeTruthy();
    expect(el().querySelector('app-lot-tabs')).toBeNull();
    http.expectNone('/api/lots/1/events/');
  });

  it('si falla la red, lo dice y deja reintentar', async () => {
    await setup('log');
    http.expectOne('/api/lots/1/').flush('', { status: 0, statusText: 'Unknown Error' });
    await fixture.whenStable();
    expect(text()).toContain("Couldn't load the field");

    button('Try again')?.click();
    await fixture.whenStable();
    await load(LOT);
    expect(el().querySelector('app-lot-tabs h1')?.textContent).toContain('Lote de prueba');
  });
});
