import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SimulationResult } from '../../../core/models';
import { makeCriterion, makeFootprint, makeScore } from '../testing';
import { Simulator } from './simulator';

const RESULT: SimulationResult = {
  lot: 1,
  changes: { cover_crop: true },
  persisted: false,
  message: 'Simulación: no modifica los datos del lote.',
  notes: ['Se agregó un cultivo de cobertura hipotético (no se guarda).'],
  changed_criteria: [
    { key: 'winter_cover', label: 'Cobertura', before: 'no_cumple', after: 'cumple' },
  ],
  before: { footprint: makeFootprint(), score: makeScore() },
  after: {
    footprint: makeFootprint(),
    score: makeScore({
      criteria: [makeCriterion({ status: 'cumple', status_label: 'Cumple', hypothetical: true })],
    }),
  },
};

describe('Simulator', () => {
  let fixture: ComponentFixture<Simulator>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Simulator],
      providers: [provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(Simulator);
    fixture.componentRef.setInput('lotId', 1);
    fixture.componentRef.setInput('campaign', 10);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  it('avisa que no modifica los datos del lote', () => {
    expect(el().textContent).toContain('Simulación: no modifica los datos del lote.');
  });

  it('envía el cambio y muestra antes y después', async () => {
    (el().querySelector('button') as HTMLButtonElement).click();
    const request = http.expectOne('/api/lots/1/simulate/');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ cover_crop: true, campaign: 10 });
    request.flush(RESULT);
    await fixture.whenStable();

    const text = el().textContent ?? '';
    // antes y después en dos tarjetas: huella y puntaje
    const tiles = [...el().querySelectorAll('.tile')].map((t) => t.textContent ?? '');
    expect(tiles[0]).toContain('Huella por tonelada');
    expect(tiles[0]).toContain('Después (hipotético)');
    expect(tiles[0]).toContain('Todavía no se puede calcular');
    expect(tiles[1]).toContain('Puntaje provisional');
    expect(tiles[1]).toContain('Sin número');
    // solo el criterio que cambia queda a la vista
    const changes = el().querySelector('.changes')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(changes).toContain('Cobertura');
    expect(changes).toContain('✗ No cumple');
    expect(changes).toContain('✓ Cumple');
    // la tabla de todos los criterios y las notas, plegadas
    const folded = el().querySelector('app-disclosure')?.textContent ?? '';
    expect(folded).toContain('Ver todos los criterios y notas');
    expect(folded).toContain('(cambia)');
    expect(folded).toContain('Se agregó un cultivo de cobertura hipotético (no se guarda).');
    expect(text).toContain('Simulación lista.');
  });

  it('si falla lo dice en lenguaje llano', async () => {
    (el().querySelector('button') as HTMLButtonElement).click();
    http.expectOne('/api/lots/1/simulate/').flush('', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos mostrar la simulación en este momento.',
    );
  });
});
