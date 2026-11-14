import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { makeFootprint, makeScore } from '../testing';
import { FootprintPage } from './footprint-page';

describe('FootprintPage', () => {
  let fixture: ComponentFixture<FootprintPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FootprintPage],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ lotId: '1' })) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FootprintPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  function flushAll(): void {
    http.expectOne('/api/lots/1/').flush({ id: 1, name: 'Lote de prueba', campaigns: [] });
    http.expectOne('/api/lots/1/score/').flush(makeScore());
    http.expectOne('/api/lots/1/footprint/').flush(makeFootprint());
  }

  it('explica que todavía no se puede calcular y muestra el motivo de cada componente', async () => {
    flushAll();
    await fixture.whenStable();
    const text = el().textContent ?? '';
    expect(text).toContain('Lote de prueba');
    expect(text).toContain('No se puede calcular todavía');
    expect(text).toContain('Gasoil de labores');
    expect(text).toContain('Falta el factor de emisión');
    expect(text).toContain('Nivel de confianza: Bajo');
    expect(text).toContain('Estimación con respaldo satelital. Prueba de concepto.');
    expect(text).toContain('Dato simulado para la demostración');
    expect(text).toContain('pesos pendientes de definir por el equipo');
    expect(text).toContain('No cumple');
    expect(text).toContain('Estimado');
    expect(text).toContain('Simulación: no modifica los datos del lote.');
    expect(text.toLowerCase()).not.toContain('certific');
  });

  it('muestra el valor por tonelada cuando el backend lo calcula', async () => {
    http.expectOne('/api/lots/1/').flush({ id: 1, name: 'Lote de prueba', campaigns: [] });
    http.expectOne('/api/lots/1/score/').flush(makeScore({ score: 80 }));
    http
      .expectOne('/api/lots/1/footprint/')
      .flush(makeFootprint({ complete: true, total_kg_co2e_per_t: 37.5, message: null }));
    await fixture.whenStable();
    const text = el().textContent ?? '';
    expect(text).toContain('37,5 kg CO2e/t');
    expect(text).toContain('80 / 100');
  });

  it('pide la huella de la campaña elegida', async () => {
    flushAll();
    await fixture.whenStable();
    const select = el().querySelector('select') as HTMLSelectElement;
    select.value = '9';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const request = http.expectOne((r) => r.url === '/api/lots/1/footprint/');
    expect(request.request.params.get('campaign')).toBe('9');
  });
});
