import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

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

/**
 * el lote nuevo después de declarar el uso del suelo: el puntaje toma la declaración con su
 * origen (backend/carbon/score.py) y el resto sigue sin dato
 */
function declaredLot(unchanged: boolean): ScoreCriterion[] {
  return NEW_LOT.map((c, index) =>
    index === 0
      ? criterion(c.key, unchanged ? 'cumple' : 'no_cumple', {
          origin: 'DECLARED',
          reason: unchanged
            ? 'El productor declaró que el lote no cambió de uso del suelo desde 2020.'
            : 'El productor declaró que el lote cambió de uso del suelo desde 2020.',
        })
      : c,
  );
}

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
    expect(cover.action).toBe('Add a winter cover crop.');
    expect(cover.why).toContain('it protects it from erosion');
    expect(cover.now).toBe('It currently shows as “Not met”: Motivo de winter_cover.');
    expect(cover.where).toContain('Footprint tab');
    // lo que no cumple por un evento detectado se revisa en la bitácora
    expect(burn.where).toContain('Field log tab');
    expect(rotation.where).toContain('Fertilization tab');
  });

  it('cada recomendación que sigue en otra pestaña lleva un enlace corto a esa pestaña', () => {
    const [cover, burn, rotation] = pickRecommendations(MIXED);
    expect(cover.link).toEqual({
      label: 'Simulate in Footprint',
      tab: 'footprint',
      params: { vista: 'simulador' },
    });
    expect(burn.link).toEqual({ label: 'Review in Field log', tab: 'log' });
    expect(rotation.link).toEqual({ label: 'Go to Fertilization', tab: 'fertilization' });
    expect(pickRecommendations([criterion('nuevo', 'no_cumple')])[0].link).toBeNull();
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
      expect.objectContaining({ status: 'sin_dato', chip: 'No data', origin: null, note: null }),
    );
    expect(till.label).toBe('No-till');
    expect(shortLabel('Sin cambio de uso del suelo desde 2020')).toBe(
      'Sin cambio de uso del suelo desde 2020',
    );
  });

  it('con declaración muestra lo declarado y, cuando el puntaje ya la usa, lo dice', () => {
    // recién declarado, el puntaje que se ve todavía es el de antes: no se dice que la usa
    const [same] = practiceRows([landUse], declared(true), 'match');
    expect(same).toEqual(
      expect.objectContaining({ status: 'cumple', chip: 'Met', tone: 'ok', origin: 'DECLARED' }),
    );
    expect(same.note).toBe('You declared it on 15/11/2026, and what MODIS saw supports it.');
    const [counted] = practiceRows(declaredLot(true).slice(0, 1), declared(true), 'match');
    expect(counted.note).toBe(
      'You declared it on 15/11/2026, and what MODIS saw supports it. The provisional score and the footprint use your declaration.',
    );
    expect(counted.note).not.toContain('not yet');

    const [review] = practiceRows([landUse], declared(true), 'mismatch');
    expect(review).toEqual(
      expect.objectContaining({ chip: 'Review', icon: 'alert', tone: 'warn', declared: true }),
    );
    expect(review.note).toContain('does not match what MODIS saw: check it');

    const [change] = practiceRows([landUse], declared(false), 'declared_change');
    expect(change).toEqual(expect.objectContaining({ status: 'no_cumple', chip: 'Not met' }));
    expect(change.note).toContain('On 15/11/2026 you declared a land-use change.');

    const [waiting] = practiceRows([landUse], declared(true), 'no_modis');
    expect(waiting.note).toContain('You declared it on 15/11/2026.');

    // un empate de MODIS en el año base no contradice: la fila no pide revisar
    const [unclear] = practiceRows([landUse], declared(true), 'unconfirmed');
    expect(unclear).toEqual(expect.objectContaining({ chip: 'Met', tone: 'ok' }));
    expect(unclear.note).toContain('MODIS is not enough to confirm it');
  });

  it('si la bitácora registra un cambio de uso, manda ese evento y pide revisar lo declarado', () => {
    const detected = criterion('no_land_use_change_since_2020', 'no_cumple', {
      origin: 'VERIFIED',
      evidence: [
        {
          type: 'LAND_USE_CHANGE',
          date: '2022-03-01',
          origin: 'VERIFIED',
          is_simulated: false,
          hypothetical: false,
        },
      ],
    });
    const [review] = practiceRows([detected], declared(true), 'match');
    expect(review).toEqual(
      expect.objectContaining({
        status: 'no_cumple',
        chip: 'Review',
        tone: 'warn',
        origin: 'VERIFIED',
        declared: false,
      }),
    );
    expect(review.note).toContain('the field log records a land-use change');
    expect(review.note).toContain('the score and the footprint use that event');

    const [agree] = practiceRows([detected], declared(false), 'declared_change');
    expect(agree).toEqual(expect.objectContaining({ chip: 'Not met', origin: 'VERIFIED' }));
    expect(agree.note).toContain('the field log records it too');
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
    squash(node?.querySelector('app-info-tip [popover]')?.textContent);

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
      'Add a winter cover crop.',
      'Leave the crop residue as cover, without burning it.',
      'Rotate crops between seasons.',
    ]);
    // el porqué y el estado de hoy, en la ayuda (i) de cada tarjeta
    expect(tipOf(recs[0])).toContain('It currently shows as “Not met”');
    expect(recs[0].querySelector('app-info-tip button')?.getAttribute('aria-label')).toBe(
      'Why: Add a winter cover crop.',
    );
    // las recomendaciones son una región con nombre
    const region = el().querySelector('section.recs-block');
    expect(el().querySelector(`#${region?.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'What to do next',
    );

    const rows = [...el().querySelectorAll('.practices li')];
    expect(rows.map((row) => row.querySelector('.state')?.textContent?.trim())).toEqual([
      'No data',
      'Met',
      'Not met',
      'No data',
      'Not met',
    ]);
    // el estado nunca va solo con color: cada chip lleva su ícono
    expect(rows.every((row) => row.querySelector('.state app-icon'))).toBe(true);
    expect(squash(rows[1].querySelector('.name')?.textContent)).toBe('No-till Estimated');
    expect(squash(el().querySelector('.score')?.textContent)).toBe('Provisional score 40 of 100');
    // a la vista no hay párrafos: ni porqués ni motivos del backend
    expect(visible()).not.toContain('Motivo de');
    expect(visible()).not.toContain('erosion');
    expect(text()).not.toContain('Simulated data for the demo');
  });

  it('el enlace de una recomendación pide la pestaña al espacio del lote, sin navegar', async () => {
    const requests: unknown[] = [];
    fixture.componentInstance.openTab.subscribe((change) => requests.push(change));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    await render(LOT, score(MIXED, { score: 40, missing_criteria: [] }));

    const links = [...el().querySelectorAll<HTMLAnchorElement>('.rec__link')];
    expect(links.map((link) => squash(link.textContent))).toEqual([
      'Simulate in Footprint',
      'Review in Field log',
      'Go to Fertilization',
    ]);
    // con dirección de verdad: Ctrl+clic o el botón del medio abren la pestaña aparte
    expect(links[0].getAttribute('href')).toBe('/huella/1?vista=simulador');
    expect(links[1].getAttribute('href')).toBe('/lotes/1/bitacora');

    links[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(requests).toEqual([{ tab: 'footprint', params: { vista: 'simulador' } }]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('si nadie escucha, el enlace de una recomendación navega a la ruta de la pestaña', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await render(LOT, score(MIXED, { score: 40, missing_criteria: [] }));

    const link = el().querySelector<HTMLAnchorElement>('.rec__link')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/huella/1?vista=simulador');
  });

  it('"Cómo se calcula" tiene pesos, motivos, confianza, aviso provisional y evidencia', async () => {
    await render(LOT, score(MIXED, { score: 40, missing_criteria: [] }));

    const how = el().querySelector('app-disclosure .how');
    const howText = squash(how?.textContent);
    expect(howText).toContain('Prueba de concepto: no es una calculadora auditada.');
    expect(howText).toContain('that is why it is provisional');
    expect(howText).toContain('worth 20 of 100 points');
    expect(howText).toContain('No-till (no soil disturbance)');
    expect(howText).toContain('Motivo de no_burn.');
    expect(howText).toContain('Confidence: low. Regla.');
    expect(howText).toContain('Burning on 02/08/2026');
    expect(how?.querySelectorAll('.how__item').length).toBe(5);
    expect(how?.querySelectorAll('.how__evidence app-origin-badge').length).toBe(1);
  });

  it('en un lote nuevo lo dice en una línea, sin culpar a nadie', async () => {
    await render(LOT, score(NEW_LOT));

    expect(el().querySelector('h2')?.textContent).toContain('Good practices');
    expect(visible()).toContain('No field work in the field log yet.');
    expect(el().querySelector('.score .score__none')?.textContent?.trim()).toBe('Not calculated');
    expect(el().querySelector('.score .stat__hint')?.textContent?.trim()).toBe(
      'Missing data for 5 practices',
    );
    expect(el().querySelectorAll('.rec').length).toBe(3);
    // las cinco sin dato van plegadas en una línea: "Sin dato" no se repite en cada fila
    expect(squash(el().querySelector('.folded summary')?.textContent)).toContain(
      '5 practices with no data yet',
    );
    expect(el().querySelectorAll('app-disclosure.folded .practices li').length).toBe(5);
    expect(el().querySelectorAll('.practices li').length).toBe(5);
  });

  it('con una declaración en un lote nuevo, lo declarado sigue a la vista y el resto plegado', async () => {
    await render({ ...LOT, land_use_declaration: declared(true) }, score(declaredLot(true)));
    const shown = [...el().querySelectorAll('.practices li')].filter(
      (row) => !row.closest('app-disclosure'),
    );
    expect(shown.length).toBe(1);
    expect(shown[0].querySelector('.state')?.textContent?.trim()).toBe('Met');
    expect(squash(el().querySelector('.folded summary')?.textContent)).toContain(
      '4 practices with no data yet',
    );
    // el puntaje ya usa la declaración: faltan las mismas que en la lista, sin más aclaraciones
    expect(el().querySelector('.score .stat__hint')?.textContent?.trim()).toBe(
      'Missing data for 4 practices',
    );
    expect(text()).not.toContain('no suma');
  });

  it('mientras el puntaje se vuelve a pedir, la práctica declarada no se cuenta como faltante', async () => {
    // el puntaje que se ve es el de antes de declarar: el uso del suelo figura sin dato
    const criteria = NEW_LOT.map((c, index) =>
      index === 0 ? c : { ...c, status: 'cumple' as const },
    );
    await render({ ...LOT, land_use_declaration: declared(true) }, score(criteria));
    expect(el().querySelector('.score .stat__hint')?.textContent?.trim()).toBe('');
    expect(text()).not.toContain('no suma');
  });

  it('en un ejemplo es de solo lectura: no invita a declarar y muestra solo lo de MODIS', async () => {
    await render({ ...LOT, is_example: true, owned: false }, score(NEW_LOT));

    expect(button('No, it did not change')).toBeUndefined();
    expect(text()).not.toContain('Declared by you');
    expect(el().querySelectorAll('app-land-use-card .year').length).toBe(4);
  });

  it('la fila del uso del suelo no contradice a la tarjeta cuando hay una declaración', async () => {
    const lot = { ...LOT, land_use_declaration: declared(true) };
    await render(lot, score(declaredLot(true)));

    const row = landUseRow();
    expect(row?.querySelector('.state')?.textContent?.trim()).toBe('Met');
    expect(row?.querySelector('app-origin-badge')?.textContent).toContain('Declared');
    expect(tipOf(row)).toContain('what MODIS saw supports it');
    expect(tipOf(row)).toContain('The provisional score and the footprint use your declaration');
    expect(visible()).toContain('Supported by what MODIS saw');
    // lo declarado ya no se recomienda como si faltara el dato
    const recs = [...el().querySelectorAll('.rec')].map((rec) => rec.textContent ?? '');
    expect(recs.some((rec) => rec.includes('montes'))).toBe(false);
    // "Cómo se calcula" dice lo que usó el puntaje: la declaración, con su origen
    const how = squash(el().querySelector('app-disclosure .how')?.textContent);
    expect(how).toContain(
      'El productor declaró que el lote no cambió de uso del suelo desde 2020.',
    );
    expect(how).not.toContain('not counted yet');
  });

  it('si la bitácora registra el cambio de uso, "Cómo se calcula" dice que manda ese evento', async () => {
    const detected = NEW_LOT.map((c, index) =>
      index === 0
        ? criterion(c.key, 'no_cumple', {
            origin: 'VERIFIED',
            evidence: [
              {
                type: 'LAND_USE_CHANGE',
                date: '2022-03-01',
                origin: 'VERIFIED',
                is_simulated: false,
                hypothetical: false,
              },
            ],
          })
        : c,
    );
    await render({ ...LOT, land_use_declaration: declared(true) }, score(detected));
    expect(landUseRow()?.querySelector('.state')?.textContent?.trim()).toBe('Review');
    expect(squash(el().querySelector('app-disclosure .how')?.textContent)).toContain(
      'Your declaration of 15/11/2026 does not count here: the land-use change recorded in the field log takes precedence.',
    );
  });

  it('si lo declarado no coincide con MODIS, la fila pide revisarlo, igual que la tarjeta', async () => {
    modis.set(MODIS_CHANGED);
    await render({ ...LOT, land_use_declaration: declared(true) }, score(declaredLot(true)));

    const state = landUseRow()?.querySelector('.state');
    expect(state?.textContent?.trim()).toBe('Review');
    expect(state?.classList).toContain('chip--warn');
    expect(visible()).toContain('Does not match MODIS: review it');
  });

  it('sin declaración, si el puntaje lo da por cumplido y MODIS vio otro uso, pide revisarlo', async () => {
    modis.set(MODIS_CHANGED);
    const criteria = NEW_LOT.map((c, index) =>
      index === 0
        ? { ...c, status: 'cumple' as const, status_label: 'Cumple', origin: 'ESTIMATED' as const }
        : c,
    );
    await render({ ...LOT, is_example: true, owned: false }, score(criteria));

    const row = landUseRow();
    const state = row?.querySelector('.state');
    expect(state?.textContent?.trim()).toBe('Review');
    expect(state?.classList).toContain('chip--warn');
    expect(row?.querySelector('app-origin-badge')?.textContent).toContain('Estimated');
    expect(row?.querySelector('app-info-tip button')?.getAttribute('aria-label')).toBe(
      'MODIS and the score',
    );
    expect(tipOf(row)).toContain('MODIS saw a different use');

    // si MODIS no vio nada distinto, queda lo que dice el puntaje
    modis.set(MODIS_SAME);
    await fixture.whenStable();
    expect(landUseRow()?.querySelector('.state')?.textContent?.trim()).toBe('Met');
  });

  it('al declarar desde la tarjeta, la fila pasa a mostrar lo declarado y el puntaje se pide de nuevo', async () => {
    const emitted: LandUseDeclaration[] = [];
    fixture.componentInstance.declared.subscribe((value) => emitted.push(value));
    await render(LOT, score(NEW_LOT));
    expect(landUseRow()?.querySelector('.state')?.textContent?.trim()).toBe('No data');

    button('Yes, there was a change')?.click();
    await fixture.whenStable();
    http.expectOne('/api/lots/1/land-use/').flush(declared(false));
    await fixture.whenStable();

    // el espacio del lote se entera, así la declaración sigue al volver a la pestaña
    expect(emitted).toEqual([declared(false)]);
    // mientras llega el puntaje nuevo se ve lo declarado
    expect(landUseRow()?.querySelector('.state')?.textContent?.trim()).toBe('Not met');
    expect(visible()).toContain('With a change, the practice is not met');

    // el backend ya usa la declaración: el puntaje se vuelve a pedir y la ayuda lo dice
    http.expectOne('/api/lots/1/score/').flush(score(declaredLot(false)));
    await fixture.whenStable();
    expect(landUseRow()?.querySelector('.state')?.textContent?.trim()).toBe('Not met');
    expect(tipOf(landUseRow())).toContain(
      'The provisional score and the footprint use your declaration',
    );
    expect(el().querySelector('.score .stat__hint')?.textContent?.trim()).toBe(
      'Missing data for 4 practices',
    );
  });

  it('sin editable no ofrece declarar aunque el lote sea propio', async () => {
    await render(LOT, score(NEW_LOT), false);
    expect(button('No, it did not change')).toBeUndefined();
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
    expect(visible()).toContain('Simulated data for the demo');
  });

  it('si no carga, lo dice y deja reintentar', async () => {
    fixture.componentRef.setInput('lot', LOT);
    await fixture.whenStable();
    http.expectOne('/api/lots/1/score/').flush('', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(text()).toContain('Could not load good practices');

    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry')?.click();
    await fixture.whenStable();
    http.expectOne('/api/lots/1/score/').flush(score(MIXED));
    await fixture.whenStable();
    expect(el().querySelectorAll('.practices li').length).toBe(5);
  });
});
