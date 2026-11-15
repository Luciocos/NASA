import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  LandUseDeclaration,
  LotDetail,
  ScoreCriterion,
  SustainabilityScore,
} from '../../../core/models';
import {
  type LandUseEvidence,
  type LoadState,
  LotSatellite,
  landUseEvidence,
} from '../../../core/nasa';
import { LotPractices } from './lot-practices';
import { pickRecommendations, practiceRows, shortLabel } from './practices';

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
  criterion('no_till', 'cumple', { label: 'Siembra directa (sin remoción de suelo)' }),
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

/** lo que vio MODIS, calculado con la regla real de core/nasa a partir de las clases */
function modisState(classes: number[]): LoadState<LandUseEvidence> {
  return {
    status: 'ready',
    data: landUseEvidence({
      years: classes.map((id, index) => ({ year: 2020 + index, classes: [id, id] })),
      baselineYear: 2020,
      pixelCount: 2,
      pixelSizeM: 463.31,
      centroidFallback: false,
      retrievedAt: '2026-11-15T12:00:00Z',
    }),
    progress: 1,
    stale: false,
    updatedAt: '2026-11-15T12:00:00Z',
    error: null,
  };
}
/** cultivo todos los años */
const MODIS_SAME = modisState([12, 12, 12, 12]);
/** pastizal en 2020 y cultivo después */
const MODIS_CHANGED = modisState([10, 12, 12, 12]);

function declared(unchanged: boolean): LandUseDeclaration {
  return { unchanged, declared_at: '2026-11-15T15:00:00-03:00', origin: 'DECLARED' };
}

const NEW_LOT = [
  'no_land_use_change_since_2020',
  'no_till',
  'winter_cover',
  'rotation',
  'no_burn',
].map((key) => criterion(key, 'sin_dato'));

const squash = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

describe('pickRecommendations', () => {
  it('pone primero lo que no cumple, después lo que falta medir, y como mucho tres', () => {
    const picked = pickRecommendations(MIXED);
    expect(picked.map((rec) => [rec.key, rec.status])).toEqual([
      ['winter_cover', 'no_cumple'],
      ['no_burn', 'no_cumple'],
      ['rotation', 'sin_dato'],
    ]);
  });

  it('una frase a la vista; el porqué, el estado de hoy y dónde seguir, para la ayuda', () => {
    const [cover, burn, rotation] = pickRecommendations(MIXED);
    expect(cover.action).toBe('Sumá un cultivo de cobertura en invierno.');
    expect(cover.why).toContain('lo protege de la erosión');
    expect(cover.now).toBe('Hoy figura como «No cumple»: Motivo de winter_cover.');
    expect(cover.where).toContain('pestaña Huella');
    // lo que no cumple por un evento detectado se revisa en la bitácora
    expect(burn.where).toContain('pestaña Bitácora');
    expect(rotation.where).toContain('pestaña Fertilización');
  });

  it('no recomienda lo que se pide saltear, como el uso del suelo ya declarado', () => {
    const picked = pickRecommendations(NEW_LOT.slice(0, 2), 3, ['no_land_use_change_since_2020']);
    expect(picked.map((rec) => rec.key)).toEqual(['no_till']);
  });

  it('no recomienda nada si todo cumple, y usa el texto del backend si no conoce el criterio', () => {
    expect(pickRecommendations(MIXED.map((c) => ({ ...c, status: 'cumple' as const })))).toEqual(
      [],
    );
    const [unknown] = pickRecommendations([criterion('nuevo', 'no_cumple')]);
    expect(unknown.action).toBe('Práctica nuevo');
    expect(unknown.why).toBe('Motivo de nuevo.');
    expect(unknown.where).toBeNull();
  });
});

describe('practiceRows', () => {
  const landUse = criterion('no_land_use_change_since_2020', 'sin_dato');

  it('sin declaración muestra lo que cuenta el puntaje, con el nombre corto', () => {
    const [row, till] = practiceRows([landUse, MIXED[1]], null, null);
    expect(row).toEqual(
      expect.objectContaining({ status: 'sin_dato', chip: 'Sin dato', origin: null, note: null }),
    );
    expect(till.label).toBe('Siembra directa');
    expect(shortLabel('Sin cambio de uso del suelo desde 2020')).toBe(
      'Sin cambio de uso del suelo desde 2020',
    );
  });

  it('con declaración muestra lo declarado y aclara que el puntaje todavía no lo suma', () => {
    const [same] = practiceRows([landUse], declared(true), 'match');
    expect(same).toEqual(
      expect.objectContaining({ status: 'cumple', chip: 'Cumple', tone: 'ok', origin: 'DECLARED' }),
    );
    expect(same.note).toBe(
      'Lo declaraste el 15/11/2026 y lo respalda lo que vio MODIS. El puntaje provisional todavía no suma tu declaración: ahí figura como «Sin dato».',
    );

    const [review] = practiceRows([landUse], declared(true), 'mismatch');
    expect(review).toEqual(
      expect.objectContaining({ chip: 'Revisar', icon: 'alert', tone: 'warn', declared: true }),
    );
    expect(review.note).toContain('no coincide con lo que vio MODIS: revisalo');

    const [change] = practiceRows([landUse], declared(false), 'declared_change');
    expect(change).toEqual(expect.objectContaining({ status: 'no_cumple', chip: 'No cumple' }));
    expect(change.note).toContain('Declaraste el 15/11/2026 que hubo un cambio de uso del suelo.');

    const [waiting] = practiceRows([landUse], declared(true), 'no_modis');
    expect(waiting.note).toContain('Lo declaraste el 15/11/2026.');

    // un empate de MODIS en el año base no contradice: la fila no pide revisar
    const [unclear] = practiceRows([landUse], declared(true), 'unconfirmed');
    expect(unclear).toEqual(expect.objectContaining({ chip: 'Cumple', tone: 'ok' }));
    expect(unclear.note).toContain('MODIS no alcanza para confirmarlo');
  });

  it('las demás prácticas no cambian con la declaración', () => {
    const rows = practiceRows(MIXED, declared(true), 'match');
    expect(rows.slice(1).map((row) => row.declared)).toEqual([false, false, false, false]);
    expect(rows.slice(1).map((row) => row.status)).toEqual(MIXED.slice(1).map((c) => c.status));
  });
});

describe('LotPractices', () => {
  let fixture: ComponentFixture<LotPractices>;
  let http: HttpTestingController;
  let modis: WritableSignal<LoadState<LandUseEvidence>>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => squash(el().textContent);
  /** lo que se ve: todo menos el contenido de las ayudas (i) y lo plegado */
  const visible = () => {
    const clone = el().cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll('[popover], .visually-hidden, app-disclosure')
      .forEach((node) => node.remove());
    return squash(clone.textContent);
  };
  const button = (label: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim().includes(label));
  const landUseRow = () => el().querySelector('.practices li');
  const tipOf = (node: Element | null | undefined) =>
    squash(node?.querySelector('app-practice-tip [popover]')?.textContent);

  async function render(lot: LotDetail, body: SustainabilityScore, editable = true) {
    fixture.componentRef.setInput('lot', lot);
    fixture.componentRef.setInput('editable', editable);
    await fixture.whenStable();
    http.expectOne('/api/lots/1/score/').flush(body);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    modis = signal(MODIS_SAME);
    await TestBed.configureTestingModule({
      imports: [LotPractices],
      providers: [
        provideHttpClientTesting(),
        { provide: LotSatellite, useValue: { landUse: () => modis, retry: () => undefined } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LotPractices);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // el panel de chequeos territoriales pide lo suyo; acá no se prueba
    http
      .match((req) => req.url.endsWith('/territorial-checks/'))
      .forEach((req) => req.flush({ lot: 1, disclaimer: '', checks: [] }));
    http.verify();
  });

  it('destaca hasta tres recomendaciones de una frase y cada práctica con su chip', async () => {
    await render(LOT, score(MIXED, { score: 40, missing_criteria: [] }));

    const recs = [...el().querySelectorAll('.rec')];
    expect(recs.map((rec) => squash(rec.querySelector('.rec__action')?.textContent))).toEqual([
      'Sumá un cultivo de cobertura en invierno.',
      'Dejá el rastrojo como cobertura, sin quemarlo.',
      'Alterná cultivos entre campañas.',
    ]);
    // el porqué y el estado de hoy, en la ayuda (i) de cada tarjeta
    expect(tipOf(recs[0])).toContain('Hoy figura como «No cumple»');
    expect(recs[0].querySelector('app-practice-tip button')?.getAttribute('aria-label')).toBe(
      'Por qué: Sumá un cultivo de cobertura en invierno.',
    );
    // las recomendaciones son una región con nombre
    const region = el().querySelector('section.recs-block');
    expect(el().querySelector(`#${region?.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Qué conviene hacer',
    );

    const rows = [...el().querySelectorAll('.practices li')];
    expect(rows.map((row) => row.querySelector('.state')?.textContent?.trim())).toEqual([
      'Sin dato',
      'Cumple',
      'No cumple',
      'Sin dato',
      'No cumple',
    ]);
    // el estado nunca va solo con color: cada chip lleva su ícono
    expect(rows.every((row) => row.querySelector('.state app-icon'))).toBe(true);
    expect(squash(rows[1].querySelector('.name')?.textContent)).toBe('Siembra directa Estimado');
    expect(squash(el().querySelector('.score')?.textContent)).toBe('Puntaje provisional 40 de 100');
    // a la vista no hay párrafos: ni porqués ni motivos del backend
    expect(visible()).not.toContain('Motivo de');
    expect(visible()).not.toContain('erosión');
    expect(text()).not.toContain('Dato simulado para la demostración');
  });

  it('"Cómo se calcula" tiene pesos, motivos, confianza, aviso provisional y evidencia', async () => {
    await render(LOT, score(MIXED, { score: 40, missing_criteria: [] }));

    const how = el().querySelector('app-disclosure .how');
    const howText = squash(how?.textContent);
    expect(howText).toContain('Prueba de concepto: no es una calculadora auditada.');
    expect(howText).toContain('por eso es provisional');
    expect(howText).toContain('vale 20 de 100 puntos');
    expect(howText).toContain('Siembra directa (sin remoción de suelo)');
    expect(howText).toContain('Motivo de no_burn.');
    expect(howText).toContain('Confianza baja. Regla.');
    expect(howText).toContain('Quema del 02/08/2026');
    expect(how?.querySelectorAll('.how__item').length).toBe(5);
    expect(how?.querySelectorAll('.how__evidence app-origin-badge').length).toBe(1);
  });

  it('en un lote nuevo lo dice en una línea, sin culpar a nadie', async () => {
    await render(LOT, score(NEW_LOT));

    expect(el().querySelector('h2')?.textContent).toContain('Buenas prácticas');
    expect(visible()).toContain('Todavía no hay labores en la bitácora.');
    expect(el().querySelector('.score .score__none')?.textContent?.trim()).toBe('Sin calcular');
    expect(el().querySelector('.score .stat__hint')?.textContent?.trim()).toBe(
      'Faltan datos de 5 prácticas',
    );
    expect(el().querySelectorAll('.rec').length).toBe(3);
  });

  it('en un ejemplo es de solo lectura: no invita a declarar y muestra solo lo de MODIS', async () => {
    await render({ ...LOT, is_example: true, owned: false }, score(NEW_LOT));

    expect(button('No cambié')).toBeUndefined();
    expect(text()).not.toContain('Declarado por vos');
    expect(el().querySelectorAll('app-land-use-card .year').length).toBe(4);
  });

  it('la fila del uso del suelo no contradice a la tarjeta cuando hay una declaración', async () => {
    const lot = { ...LOT, land_use_declaration: declared(true) };
    await render(lot, score(NEW_LOT));

    const row = landUseRow();
    expect(row?.querySelector('.state')?.textContent?.trim()).toBe('Cumple');
    expect(row?.querySelector('app-origin-badge')?.textContent).toContain('Declarado');
    expect(tipOf(row)).toContain('lo respalda lo que vio MODIS');
    expect(tipOf(row)).toContain('El puntaje provisional todavía no suma tu declaración');
    expect(visible()).toContain('Respaldado por lo que vio MODIS');
    // lo declarado ya no se recomienda como si faltara el dato
    const recs = [...el().querySelectorAll('.rec')].map((rec) => rec.textContent ?? '');
    expect(recs.some((rec) => rec.includes('montes'))).toBe(false);
    expect(text()).toContain('Tu declaración del 15/11/2026 todavía no entra en este cálculo.');
  });

  it('si lo declarado no coincide con MODIS, la fila pide revisarlo, igual que la tarjeta', async () => {
    modis.set(MODIS_CHANGED);
    await render({ ...LOT, land_use_declaration: declared(true) }, score(NEW_LOT));

    const state = landUseRow()?.querySelector('.state');
    expect(state?.textContent?.trim()).toBe('Revisar');
    expect(state?.classList).toContain('chip--warn');
    expect(visible()).toContain('No coincide con MODIS: revisalo');
  });

  it('al declarar desde la tarjeta, la fila pasa a mostrar lo declarado', async () => {
    await render(LOT, score(NEW_LOT));
    expect(landUseRow()?.querySelector('.state')?.textContent?.trim()).toBe('Sin dato');

    button('Sí, hubo un cambio')?.click();
    await fixture.whenStable();
    http.expectOne('/api/lots/1/land-use/').flush(declared(false));
    await fixture.whenStable();

    expect(landUseRow()?.querySelector('.state')?.textContent?.trim()).toBe('No cumple');
    expect(tipOf(landUseRow())).toContain('ahí figura como «Sin dato»');
    expect(visible()).toContain('Con un cambio, la práctica no se cumple');
  });

  it('sin editable no ofrece declarar aunque el lote sea propio', async () => {
    await render(LOT, score(NEW_LOT), false);
    expect(button('No cambié')).toBeUndefined();
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
    expect(visible()).toContain('Dato simulado para la demostración');
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
