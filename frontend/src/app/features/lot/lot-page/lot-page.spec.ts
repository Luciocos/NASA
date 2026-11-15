import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { LotDetail } from '../../../core/models';
import { makeEvent } from '../testing';
import { LotPage } from './lot-page';
import { provideNasaTesting } from '../../../core/nasa/testing';

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

describe('LotPage', () => {
  let fixture: ComponentFixture<LotPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LotPage],
      providers: [
        provideRouter([]),
        ...provideNasaTesting(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LotPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  it('muestra los datos del lote, sus campañas y la bitácora', async () => {
    http.expectOne('/api/lots/1/').flush(LOT);
    http
      .expectOne('/api/lots/1/events/')
      .flush({ lot: 1, count: 1, message: null, events: [makeEvent()] });
    await fixture.whenStable();

    const text = el().textContent ?? '';
    expect(text).toContain('Lote de prueba');
    expect(text).toContain('24,9 ha');
    expect(text).toContain('Soja');
    expect(text).toContain('Declarado');
    expect(text).toContain('Remoción de suelo');
    expect(text).toContain('Dato simulado para la demostración');
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
    expect(el().textContent).toContain('Este lote todavía no tiene eventos registrados.');
  });

  it('muestra el rendimiento con coma decimal', async () => {
    const campaign = { ...LOT.campaigns[0], yield_t_ha: 3.1, yield_origin: 'DECLARED' as const };
    http.expectOne('/api/lots/1/').flush({ ...LOT, campaigns: [campaign] });
    http.expectOne('/api/lots/1/events/').flush({ lot: 1, count: 0, message: null, events: [] });
    await fixture.whenStable();
    expect(el().querySelector('table.campaigns')?.textContent).toContain('3,1 t/ha');
  });

  it('lleva la vista a la comparación cuando ya está dibujada', async () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      const event = makeEvent({ evidence_image_url: '/media/evidence/prueba.png' });
      http.expectOne('/api/lots/1/').flush(LOT);
      http
        .expectOne('/api/lots/1/events/')
        .flush({ lot: 1, count: 1, message: null, events: [event] });
      await fixture.whenStable();

      el().querySelector<HTMLButtonElement>('app-event-log-item .button--primary')?.click();
      await fixture.whenStable();

      expect(el().querySelector('#compare')).toBeTruthy();
      expect(scrolled.map((element) => element.id)).toContain('compare');
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('avisa si el lote no existe', async () => {
    http.expectOne('/api/lots/1/').flush('', { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/lots/1/events/').flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(el().textContent).toContain('No existe un lote con ese identificador.');
  });
});
