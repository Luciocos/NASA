import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { provideSignedInTesting } from '../../../core/auth/testing';
import { LotDetail } from '../../../core/models';
import { provideNasaTesting } from '../../../core/nasa/testing';
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
  campaigns: [
    {
      id: 10,
      lot: 1,
      label: '2025/26',
      crop: 'SOY',
      crop_label: 'Soja',
      crop_origin: 'DECLARED',
      yield_t_ha: null,
      yield_origin: '',
    },
  ],
};

const EXAMPLE: LotDetail = { ...LOT, is_example: true, owned: false };

describe('LotPage', () => {
  let fixture: ComponentFixture<LotPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

  async function load(lot: LotDetail, events = [makeEvent()]): Promise<void> {
    http.expectOne('/api/lots/1/').flush(lot);
    http
      .expectOne('/api/lots/1/events/')
      .flush({ lot: 1, count: events.length, message: null, events });
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LotPage],
      providers: [
        provideRouter([]),
        ...provideNasaTesting(),
        ...provideSignedInTesting(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LotPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  it('arriba muestra solo el nombre, la superficie y el lugar; debajo, las campañas y la bitácora', async () => {
    await load(LOT);

    const header = el().querySelector('app-page-header');
    expect(header?.textContent).toContain('Lote de prueba');
    expect(header?.textContent).toContain('24,9 ha · Casilda, Santa Fe');
    expect(header?.querySelectorAll('button, a').length).toBe(0);
    expect(text()).toContain('Soja');
    expect(text()).toContain('Declarado');
    expect(text()).toContain('Remoción de suelo');
    expect(text()).toContain('Dato simulado para la demostración');
    // el panel satelital va antes que las buenas prácticas
    const sections = [...el().querySelectorAll('app-lot-nasa, app-lot-practices')];
    expect(sections.map((section) => section.tagName.toLowerCase())).toEqual([
      'app-lot-nasa',
      'app-lot-practices',
    ]);
  });

  it('en un lote propio ofrece confirmar, corregir y generar el pasaporte', async () => {
    await load(LOT);

    expect(button('Confirmar')).toBeDefined();
    expect(button('Corregir')).toBeDefined();
    expect(button('Generar pasaporte')).toBeDefined();
    expect(text()).not.toContain('Lote de ejemplo: es de solo lectura');
    expect(el().querySelector('app-lot-tabs a')?.getAttribute('href')).toBe('/mapa');
  });

  it('en un ejemplo oculta lo que escribe y avisa que es de solo lectura', async () => {
    await load(EXAMPLE, [makeEvent({ evidence_image_url: '/media/evidence/prueba.png' })]);

    expect(text()).toContain('Lote de ejemplo: es de solo lectura');
    expect(button('Confirmar')).toBeUndefined();
    expect(button('Corregir')).toBeUndefined();
    expect(button('Generar pasaporte')).toBeUndefined();
    // mirar la evidencia no escribe nada: sigue a mano
    expect(button('Ver radar contra óptico')).toBeDefined();
    const back = el().querySelector('app-lot-tabs a');
    expect(back?.textContent).toContain('Ejemplos');
    expect(back?.getAttribute('href')).toBe('/ejemplos');
  });

  it('muestra el mensaje del backend cuando la bitácora está vacía', async () => {
    http.expectOne('/api/lots/1/').flush({ ...LOT, event_count: 0 });
    http.expectOne('/api/lots/1/events/').flush({
      lot: 1,
      count: 0,
      message: 'Este lote todavía no tiene eventos registrados.',
      events: [],
    });
    await fixture.whenStable();
    expect(text()).toContain('Este lote todavía no tiene eventos registrados.');
  });

  it('muestra el rendimiento con coma decimal', async () => {
    const campaign = { ...LOT.campaigns[0], yield_t_ha: 3.1, yield_origin: 'DECLARED' as const };
    await load({ ...LOT, campaigns: [campaign] }, []);
    expect(el().querySelector('.campaigns')?.textContent).toContain('3,1 t/ha');
  });

  it('lleva la vista a la comparación cuando ya está dibujada', async () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      await load(LOT, [makeEvent({ evidence_image_url: '/media/evidence/prueba.png' })]);

      button('Ver radar contra óptico')?.click();
      await fixture.whenStable();

      expect(el().querySelector('#compare')).toBeTruthy();
      expect(scrolled.map((element) => element.id)).toContain('compare');
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('si el lote no existe o es de otra cuenta, invita a ingresar', async () => {
    http.expectOne('/api/lots/1/').flush('', { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/lots/1/events/').flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(el().querySelector('app-login-invite')).toBeTruthy();
    expect(el().querySelector('app-lot-tabs')).toBeNull();
    expect(text()).not.toContain('No existe un lote con ese identificador.');
  });

  it('si falla la red, lo dice y deja reintentar', async () => {
    http.expectOne('/api/lots/1/').flush('', { status: 0, statusText: 'Unknown Error' });
    http.expectOne('/api/lots/1/events/').flush('', { status: 0, statusText: 'Unknown Error' });
    await fixture.whenStable();
    expect(text()).toContain('No se pudo cargar el lote');

    button('Reintentar')?.click();
    await fixture.whenStable();
    await load(LOT);
    expect(text()).toContain('Lote de prueba');
  });
});
