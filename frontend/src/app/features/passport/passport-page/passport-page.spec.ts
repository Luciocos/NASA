import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { PublicPassport } from '../../../core/models';
import { makeFootprint, makeScore } from '../../footprint/testing';
import { makeEvent } from '../../lot/testing';
import { PassportPage } from './passport-page';

const TOKEN = '6f1c2f0e-0000-4000-8000-000000000000';

// Pasaporte armado para la prueba: no representa un lote real.
const PASSPORT: PublicPassport = {
  token: TOKEN,
  generated_at: '2026-11-14T13:00:00Z',
  created_at: '2026-11-14T12:00:00Z',
  expires_at: null,
  lot: {
    id: 1,
    name: 'Lote de prueba',
    renspa: '',
    locality: 'Casilda',
    province: 'Santa Fe',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-61.2, -33.05],
          [-61.19, -33.05],
          [-61.19, -33.04],
          [-61.2, -33.05],
        ],
      ],
    },
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
  },
  events: [makeEvent()],
  footprint: makeFootprint(),
  score: makeScore(),
  uses_simulated_data: true,
  disclaimer: 'Estimación con respaldo satelital. Prueba de concepto.',
  data_notice: 'Usa datos abiertos de la NASA.',
};

describe('PassportPage', () => {
  let fixture: ComponentFixture<PassportPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PassportPage],
      providers: [
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ token: TOKEN })) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PassportPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  it('muestra el lote, la bitácora, la huella, el puntaje y el descargo', async () => {
    http.expectOne(`/api/passports/${TOKEN}/`).flush(PASSPORT);
    await fixture.whenStable();
    const text = el().textContent ?? '';
    expect(text).toContain('Lote de prueba');
    expect(text).toContain('Soja');
    expect(text).toContain('Remoción de suelo');
    expect(text).toContain('Dato simulado para la demostración');
    expect(text).toContain('No se puede calcular todavía');
    expect(text).toContain('pesos pendientes de definir por el equipo');
    expect(text).toContain('Generado el');
    expect(text).toContain('Usa datos abiertos de la NASA.');
    expect(text).toContain('Imprimir');
    expect(text.toLowerCase()).not.toContain('certific');
  });

  it('muestra el rinde con coma decimal', async () => {
    const campaign = { ...PASSPORT.lot.campaigns[0], yield_t_ha: 3.2, yield_origin: 'DECLARED' };
    http
      .expectOne(`/api/passports/${TOKEN}/`)
      .flush({ ...PASSPORT, lot: { ...PASSPORT.lot, campaigns: [campaign] } });
    await fixture.whenStable();
    const text = el().textContent ?? '';
    expect(text).toContain('3,2 t/ha');
    expect(text).not.toContain('3.2');
  });

  it('en pantalla muestra los primeros eventos y pide el resto; al imprimir van todos', async () => {
    const events = Array.from({ length: 8 }, (_, i) => makeEvent({ id: i + 1 }));
    http.expectOne(`/api/passports/${TOKEN}/`).flush({ ...PASSPORT, events });
    await fixture.whenStable();
    const rows = () => [...el().querySelectorAll<HTMLElement>('tbody tr')];
    const hidden = () => rows().filter((row) => row.classList.contains('extra'));
    // las filas de más quedan en el DOM (la hoja impresa las muestra) y se ocultan en pantalla
    expect(hidden().length).toBe(2);
    const more = [...el().querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Ver los 8 eventos'),
    )!;
    expect(more.classList).toContain('no-print');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click();
    await fixture.whenStable();
    expect(hidden().length).toBe(0);
    expect(more.textContent).toContain('Ver menos');
  });

  it('las fuentes largas de las referencias se piden en pantalla y salen al imprimir', async () => {
    const footprint = makeFootprint({
      yield: {
        value: 7.85,
        unit: 't/ha',
        origin: 'ESTIMATED',
        status: 'calculado',
        reason: null,
        reference: 'Informe regional de prueba, fila Rendimiento',
      },
    });
    http.expectOne(`/api/passports/${TOKEN}/`).flush({ ...PASSPORT, footprint });
    await fixture.whenStable();
    const full = el().querySelector('.yield .reference.print-only')?.textContent ?? '';
    expect(full).toContain('Fuente: Informe regional de prueba, fila Rendimiento');
    const short = el().querySelector('.yield .reference.screen-only')?.textContent ?? '';
    expect(short).not.toContain('Fuente');
    const sources = el().querySelector('details.sources.screen-only')!;
    expect(sources.textContent).toContain('Rendimiento: Informe regional de prueba');
    // "No se puede calcular todavía" no se repite en el motivo
    expect(el().querySelector('.headline__why')?.textContent).toBe(
      'Faltan 1 de 1 componentes y falta el rendimiento.',
    );
  });

  it('el desglose y los criterios se piden en pantalla y salen abiertos al imprimir', async () => {
    http.expectOne(`/api/passports/${TOKEN}/`).flush(PASSPORT);
    await fixture.whenStable();
    const folds = () => [...el().querySelectorAll<HTMLDetailsElement>('details[data-print-open]')];
    expect(folds().map((d) => d.querySelector('summary')?.textContent?.trim())).toEqual([
      'Ver el desglose por componente (1)',
      'Ver el criterio',
    ]);
    expect(folds().every((d) => !d.open)).toBe(true);
    // la persona abre uno: queda abierto después de imprimir
    folds()[1].open = true;
    window.dispatchEvent(new Event('beforeprint'));
    expect(folds().every((d) => d.open)).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(folds().map((d) => d.open)).toEqual([false, true]);
  });

  it('si el servidor falla lo dice en lenguaje llano', async () => {
    http
      .expectOne(`/api/passports/${TOKEN}/`)
      .flush('', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    const text = el().textContent ?? '';
    expect(text).toContain('No pudimos mostrar este pasaporte en este momento.');
    expect(text.toLowerCase()).not.toContain('backend');
  });

  it('avisa si el pasaporte venció', async () => {
    http.expectOne(`/api/passports/${TOKEN}/`).flush('', { status: 410, statusText: 'Gone' });
    await fixture.whenStable();
    expect(el().textContent).toContain('Este pasaporte venció');
  });

  it('avisa si el enlace no existe', async () => {
    http.expectOne(`/api/passports/${TOKEN}/`).flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(el().textContent).toContain('No existe un pasaporte con este enlace');
  });
});
