import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LotDetail, ScoreCriterion, SustainabilityScore } from '../../../core/models';
import { LotPractices } from './lot-practices';
import { pickRecommendations } from './practices';

// lote, criterios y puntaje armados para la prueba: no representan un lote real
const LOT: LotDetail = {
  id: 1,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 24.94,
  event_count: 2,
  created_at: '2026-11-14T10:00:00Z',
  campaigns: [],
  is_example: false,
  owned: true,
};

function criterion(
  key: string,
  status: ScoreCriterion['status'],
  overrides: Partial<ScoreCriterion> = {},
): ScoreCriterion {
  const labels: Record<ScoreCriterion['status'], string> = {
    cumple: 'Cumple',
    no_cumple: 'No cumple',
    sin_dato: 'Sin dato',
  };
  return {
    key,
    label: `Práctica ${key}`,
    status,
    status_label: labels[status],
    origin: status === 'sin_dato' ? null : 'ESTIMATED',
    reason: `Motivo de ${key}.`,
    evidence: [],
    is_simulated: false,
    hypothetical: false,
    weight: 20,
    ...overrides,
  };
}

function score(criteria: ScoreCriterion[], overrides: Partial<SustainabilityScore> = {}) {
  return {
    lot: 1,
    provisional: true,
    disclaimer: 'Prueba de concepto: no es una calculadora auditada.',
    score: null,
    max_score: 100,
    weights_defined: true,
    message: null,
    criteria,
    missing_criteria: criteria.filter((c) => c.status === 'sin_dato').map((c) => c.key),
    confidence: {
      level: 'BAJO',
      counts: { VERIFIED: 0, DECLARED: 0, ESTIMATED: 1 },
      total: 1,
      rule: 'Regla.',
    },
    uses_simulated_data: false,
    ...overrides,
  } satisfies SustainabilityScore;
}

const MIXED = [
  criterion('no_land_use_change_since_2020', 'sin_dato'),
  criterion('no_till', 'cumple'),
  criterion('winter_cover', 'no_cumple'),
  criterion('rotation', 'sin_dato'),
  criterion('no_burn', 'no_cumple', {
    origin: 'VERIFIED',
    evidence: [
      {
        type: 'BURN',
        date: '2026-08-02',
        origin: 'VERIFIED',
        is_simulated: false,
        hypothetical: false,
      },
    ],
  }),
];

const NEW_LOT = [
  'no_land_use_change_since_2020',
  'no_till',
  'winter_cover',
  'rotation',
  'no_burn',
].map((key) => criterion(key, 'sin_dato'));

describe('pickRecommendations', () => {
  it('pone primero lo que no cumple, después lo que falta medir, y como mucho tres', () => {
    const picked = pickRecommendations(MIXED);
    expect(picked.map((rec) => [rec.key, rec.status])).toEqual([
      ['winter_cover', 'no_cumple'],
      ['no_burn', 'no_cumple'],
      ['rotation', 'sin_dato'],
    ]);
  });

  it('lleva a la bitácora lo que no cumple por un evento detectado', () => {
    const [cover, burn, rotation] = pickRecommendations(MIXED);
    expect(cover.link?.kind).toBe('footprint');
    expect(burn.link?.kind).toBe('log');
    expect(rotation.link?.kind).toBe('fertilization');
  });

  it('no recomienda nada si todo cumple, y usa el texto del backend si no conoce el criterio', () => {
    expect(pickRecommendations(MIXED.map((c) => ({ ...c, status: 'cumple' as const })))).toEqual(
      [],
    );
    const [unknown] = pickRecommendations([criterion('nuevo', 'no_cumple')]);
    expect(unknown.action).toBe('Práctica nuevo');
    expect(unknown.why).toBe('Motivo de nuevo.');
  });
});

describe('LotPractices', () => {
  let fixture: ComponentFixture<LotPractices>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';

  async function render(lot: LotDetail, body: SustainabilityScore): Promise<void> {
    fixture.componentRef.setInput('lot', lot);
    await fixture.whenStable();
    http.expectOne('/api/lots/1/score/').flush(body);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LotPractices],
      providers: [provideRouter([]), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(LotPractices);
    http = TestBed.inject(HttpTestingController);
  });

  it('destaca hasta tres recomendaciones y muestra cada práctica con ícono y texto', async () => {
    await render(LOT, score(MIXED, { score: 40, missing_criteria: [] }));

    const recs = [...el().querySelectorAll('.rec')];
    expect(recs.length).toBe(3);
    expect(recs[0].textContent).toContain('No cumple');
    expect(recs[0].textContent).toContain('cultivo de cobertura');
    expect(recs[2].textContent).toContain('Sin dato');

    const links = recs.map((rec) => rec.querySelector('a')?.getAttribute('href'));
    expect(links).toEqual(['/huella/1', '/lotes/1#bitacora', '/lotes/1/fertilizacion']);

    const rows = [...el().querySelectorAll('.practices li')];
    expect(rows.length).toBe(5);
    expect(rows.map((row) => row.querySelector('.state')?.textContent?.trim())).toEqual([
      'Sin dato',
      'Cumple',
      'No cumple',
      'Sin dato',
      'No cumple',
    ]);
    // el estado nunca va solo con color: cada fila lleva su ícono
    expect(rows.every((row) => row.querySelector('.state app-icon'))).toBe(true);
    expect(text()).toContain('Puntaje provisional: 40 de 100');
    expect(text()).not.toContain('Dato simulado para la demostración');
  });

  it('en un lote nuevo dice qué va a pasar, sin culpar a nadie', async () => {
    await render(LOT, score(NEW_LOT));

    expect(text()).toContain(
      'Todavía no hay datos: el satélite va a ir registrando las labores en la bitácora y vas a poder confirmarlas.',
    );
    expect(text()).toContain('Puntaje provisional: sin calcular, faltan datos de 5 prácticas');
    expect(el().querySelectorAll('.rec').length).toBe(3);
    expect(el().querySelector('h2')?.textContent).toContain('Buenas prácticas para tu lote');
  });

  it('en un ejemplo no invita a confirmar eventos', async () => {
    await render({ ...LOT, is_example: true, owned: false }, score(NEW_LOT));

    expect(el().querySelector('h2')?.textContent).toContain('Buenas prácticas para este lote');
    expect(text()).not.toContain('vas a poder confirmarlas');
  });

  it('avisa si alguna evidencia es simulada', async () => {
    const simulated = MIXED.map((c) =>
      c.key === 'no_burn'
        ? {
            ...c,
            is_simulated: true,
            evidence: c.evidence.map((e) => ({ ...e, is_simulated: true })),
          }
        : c,
    );
    await render(LOT, score(simulated));
    expect(text()).toContain('Dato simulado para la demostración');
  });

  it('si no carga, lo dice y deja reintentar', async () => {
    fixture.componentRef.setInput('lot', LOT);
    await fixture.whenStable();
    http.expectOne('/api/lots/1/score/').flush('', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(text()).toContain('No se pudieron cargar las buenas prácticas');

    [...el().querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Reintentar')
      ?.click();
    await fixture.whenStable();
    http.expectOne('/api/lots/1/score/').flush(score(MIXED));
    await fixture.whenStable();
    expect(el().querySelectorAll('.practices li').length).toBe(5);
  });
});
