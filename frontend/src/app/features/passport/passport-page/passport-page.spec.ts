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
