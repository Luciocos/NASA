import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LandUseDeclaration, LotDetail } from '../../../../core/models';
import {
  type LandUseEvidence,
  type LoadState,
  LotSatellite,
  landUseEvidence,
} from '../../../../core/nasa';
import {
  differentYears,
  firstSentence,
  forLot,
  landUseMatch,
  matchLine,
  modisChangeLine,
  modisStatus,
  noDataShort,
  visibleYears,
  yearDetails,
  yearLabel,
} from './land-use';
import { LandUseCard } from './land-use-card';

// lote, clases y fechas armados para la prueba: no representan un lote ni una consulta real
const LOT: LotDetail = {
  id: 1,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 55,
  event_count: 0,
  created_at: '2026-11-14T10:00:00Z',
  campaigns: [],
  is_example: false,
  owned: true,
  land_use_declaration: null,
};
const EXAMPLE: LotDetail = { ...LOT, is_example: true, owned: false };

const CROP = 12;
const GRASSLAND = 10;

/** evidencia calculada con la regla real de core/nasa a partir de las clases de 3 píxeles */
function modis(classes: (number | null)[], pixelCount = 3): LandUseEvidence {
  return landUseEvidence({
    years: classes.map((id, index) => ({
      year: 2020 + index,
      classes: Array.from({ length: pixelCount }, () => id),
    })),
    baselineYear: 2020,
    pixelCount,
    pixelSizeM: 463.31,
    centroidFallback: false,
    retrievedAt: '2026-11-15T12:00:00Z',
  });
}

const UNCHANGED = modis([CROP, CROP, CROP, CROP, CROP]);
const CHANGED = modis([GRASSLAND, GRASSLAND, CROP, CROP, CROP]);
const NO_DATA = modis([CROP, CROP], 0);
/** un píxel de cultivo y uno urbano todos los años: empate, sin un uso dominante */
const TIED = landUseEvidence({
  years: [2020, 2021, 2022].map((year) => ({ year, classes: [CROP, 13] })),
  baselineYear: 2020,
  pixelCount: 2,
  pixelSizeM: 463.31,
  centroidFallback: false,
  retrievedAt: '2026-11-15T12:00:00Z',
});

function ready(data: LandUseEvidence, stale = false): LoadState<LandUseEvidence> {
  return {
    status: 'ready',
    data,
    progress: 1,
    stale,
    updatedAt: '2026-11-15T12:00:00Z',
    error: null,
  };
}

const LOADING: LoadState<LandUseEvidence> = {
  status: 'loading',
  data: null,
  progress: 0,
  stale: false,
  updatedAt: null,
  error: null,
};

const FAILED: LoadState<LandUseEvidence> = {
  ...LOADING,
  status: 'error',
  progress: 1,
  error: 'Sin respuesta del servicio de la NASA. Probá de nuevo en unos minutos.',
};

function declared(unchanged: boolean): LandUseDeclaration {
  return { unchanged, declared_at: '2026-11-15T15:00:00-03:00', origin: 'DECLARED' };
}

const squash = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

describe('uso del suelo: reglas', () => {
  it('compara lo declarado con lo que vio MODIS', () => {
    expect(landUseMatch(null, 'unchanged')).toBeNull();
    expect(landUseMatch(undefined, 'possible_change')).toBeNull();
    expect(landUseMatch(true, 'unchanged')).toBe('match');
    expect(landUseMatch(true, 'possible_change')).toBe('mismatch');
    expect(landUseMatch(true, 'no_data')).toBe('no_modis');
    expect(landUseMatch(true, 'error')).toBe('no_modis');
    expect(landUseMatch(true, 'loading')).toBe('pending');
    expect(landUseMatch(false, 'unchanged')).toBe('declared_change');
    expect(landUseMatch(false, 'loading')).toBe('declared_change');
    expect(landUseMatch(true, 'unclear')).toBe('unconfirmed');
  });

  it('un empate en el año base no es un cambio: MODIS no alcanza para confirmarlo', () => {
    expect(TIED.verdict).toBe('possible_change');
    expect(modisStatus(ready(TIED))).toBe('unclear');
    const line = matchLine('unconfirmed', TIED, null);
    expect(line).toEqual(
      expect.objectContaining({ tone: 'neutral', title: 'MODIS no alcanza para confirmarlo' }),
    );
    expect(line.detail).toContain('No contradice tu declaración, pero tampoco la respalda');
    expect(modisChangeLine(TIED, true)).toEqual(
      expect.objectContaining({ tone: 'neutral', title: 'Sin un uso dominante en 2020' }),
    );
  });

  it('un cambio en parte del lote es un posible cambio, no un empate', () => {
    // 4 píxeles de cultivo en 2020; en 2022 uno (la cuarta parte) pasa a pastizal: el dominante
    // sigue siendo agrícola todos los años, pero core/nasa lo marca como posible cambio
    const partial = landUseEvidence({
      years: [
        { year: 2020, classes: [CROP, CROP, CROP, CROP] },
        { year: 2021, classes: [CROP, CROP, CROP, CROP] },
        { year: 2022, classes: [CROP, CROP, CROP, GRASSLAND] },
      ],
      baselineYear: 2020,
      pixelCount: 4,
      pixelSizeM: 463.31,
      centroidFallback: false,
      retrievedAt: '2026-11-15T12:00:00Z',
    });
    expect(partial.verdict).toBe('possible_change');
    expect(differentYears(partial)).toEqual([]);
    expect(modisStatus(ready(partial))).toBe('possible_change');
    expect(landUseMatch(true, modisStatus(ready(partial)))).toBe('mismatch');

    const line = modisChangeLine(partial, true);
    expect(line).toEqual(
      expect.objectContaining({ tone: 'warn', title: 'Un uso distinto en parte del lote' }),
    );
    expect(line?.detail).toContain(partial.reason);
    expect(line?.title).not.toContain('dominante');

    const mismatch = matchLine('mismatch', partial, null);
    expect(mismatch.detail).toContain('MODIS vio un uso distinto en parte del lote.');
    expect(mismatch.detail).toContain(partial.reason);
    expect(mismatch.detail).not.toContain('uso dominante');
    expect(matchLine('declared_change', partial, null).detail).toContain(
      'MODIS también vio un uso distinto en parte del lote.',
    );
  });

  it('lee el estado de la consulta y los años que difieren del año base', () => {
    expect(modisStatus(LOADING)).toBe('loading');
    expect(modisStatus(FAILED)).toBe('error');
    expect(modisStatus(ready(CHANGED))).toBe('possible_change');
    expect(differentYears(CHANGED)).toEqual([2022, 2023, 2024]);
    expect(differentYears(UNCHANGED)).toEqual([]);
    expect(visibleYears(UNCHANGED).map((y) => y.year)).toEqual([2020, 2021, 2022, 2023, 2024]);
    expect(visibleYears(NO_DATA)).toEqual([]);
  });

  it('la comparación es una línea corta y no acusa: el porqué va en la ayuda', () => {
    const mismatch = matchLine('mismatch', CHANGED, null);
    expect(mismatch.title).toBe('No coincide con MODIS: revisalo');
    expect(mismatch.detail).toContain('MODIS vio un uso distinto en 2022, 2023 y 2024.');
    expect(mismatch.detail).toContain('error de clasificación del satélite');
    expect(matchLine('match', UNCHANGED, null).title).toBe('Respaldado por lo que vio MODIS');
    expect(matchLine('declared_change', UNCHANGED, null).title).toBe(
      'Con un cambio, la práctica no se cumple',
    );
    expect(matchLine('no_modis', null, 'Sin conexión.').detail).toBe('Sin conexión.');
  });

  it('cada año en una o dos palabras, con el detalle técnico aparte', () => {
    const [base] = visibleYears(UNCHANGED);
    expect(yearLabel(base)).toBe('Agrícola');
    expect(yearDetails(visibleYears(UNCHANGED))).toEqual([
      '2020 a 2024: Agrícola, clase IGBP 12 (Cultivo agrícola); 3 píxeles con dato, 100 % con uso agrícola.',
    ]);
    expect(yearDetails(visibleYears(CHANGED)).map((line) => line.slice(0, 32))).toEqual([
      '2020 a 2021: Natural, clase IGBP',
      '2022 a 2024: Agrícola, clase IGB',
    ]);
    // con un empate no se nombra una clase: ninguna domina
    expect(yearDetails(visibleYears(TIED))).toEqual([
      '2020 a 2022: sin un uso dominante (empate entre usos); 2 píxeles con dato, 50 % con uso agrícola.',
    ]);
    expect(yearLabel({ ...base, pixels: 0 })).toBe('Sin dato');
    expect(yearLabel({ ...base, group: null })).toBe('Mixto');
  });

  it('"Sin dato" con un motivo cortito, y la primera oración de un error largo', () => {
    expect(noDataShort(NO_DATA)).toBe('No hay píxeles sobre el lote');
    expect(noDataShort(modis([null, CROP, CROP]))).toBe('Falta la clasificación de 2020');
    expect(noDataShort(modis([CROP]))).toBe('Falta un año después de 2020');
    expect(firstSentence(FAILED.error)).toBe('Sin respuesta del servicio de la NASA');
    expect(firstSentence('Sin punto')).toBe('Sin punto');
  });

  it('sin declaración solo habla si MODIS vio un uso distinto', () => {
    expect(modisChangeLine(UNCHANGED, true)).toBeNull();
    expect(modisChangeLine(CHANGED, false)?.title).toBe('Uso distinto en 2022, 2023 y 2024');
    expect(modisChangeLine(CHANGED, false)?.detail).not.toContain('tu lote');
  });

  it('en un lote ajeno habla de "este lote"', () => {
    expect(forLot('Tu lote es grande y tu lote es chico.', false)).toBe(
      'Este lote es grande y este lote es chico.',
    );
    expect(forLot('Tu lote.', true)).toBe('Tu lote.');
  });
});

describe('LandUseCard', () => {
  let fixture: ComponentFixture<LandUseCard>;
  let http: HttpTestingController;
  let state: WritableSignal<LoadState<LandUseEvidence>>;
  const retry = vi.fn();
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => squash(el().textContent);
  const button = (label: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim().includes(label));
  /** lo que se ve: todo menos el contenido de las ayudas (i) */
  const visible = () => {
    const clone = el().cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[popover], .visually-hidden').forEach((node) => node.remove());
    return squash(clone.textContent);
  };
  const help = (label: string) =>
    squash(
      el().querySelector(`button[aria-label="${label}"]`)?.parentElement?.querySelector('[popover]')
        ?.textContent,
    );

  async function render(lot: LotDetail, editable: boolean, data: LoadState<LandUseEvidence>) {
    state.set(data);
    fixture.componentRef.setInput('lot', lot);
    fixture.componentRef.setInput('editable', editable);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    state = signal(LOADING);
    retry.mockClear();
    await TestBed.configureTestingModule({
      imports: [LandUseCard],
      providers: [
        provideHttpClientTesting(),
        { provide: LotSatellite, useValue: { landUse: () => state, retry } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LandUseCard);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('en un ejemplo muestra solo lo de MODIS: una franja por año con ícono y texto', async () => {
    await render(EXAMPLE, true, ready(UNCHANGED));

    const years = [...el().querySelectorAll('.year')];
    expect(years.map((y) => y.querySelector('.year__num')?.textContent?.trim())).toEqual([
      '2020',
      '2021',
      '2022',
      '2023',
      '2024',
    ]);
    // el uso nunca va solo con color: cada franja lleva su ícono y su nombre
    expect(years.every((y) => y.querySelector('.year__icon'))).toBe(true);
    expect(years.map((y) => y.querySelector('.year__label')?.textContent?.trim())).toEqual(
      Array(5).fill('Agrícola'),
    );

    // a la vista, poco: el origen y "orientativo" con el tamaño del píxel
    expect(el().querySelector('.modis__head')?.textContent).toContain('Verificado');
    expect(visible()).toContain('Orientativo · píxeles de 460 m');
    expect(visible()).not.toContain('Fuente');
    // el resto, en la ayuda: píxeles, clase IGBP de cada año y fuente
    const how = help('Cómo lo mide MODIS');
    expect(how).toContain('3 píxeles de unos 460 m cubren este lote.');
    expect(how).toContain('clase IGBP 12 (Cultivo agrícola)');
    expect(how).toContain('Fuente: MODIS Terra y Aqua (ORNL DAAC)');
    expect(how).toContain('Consultado el 15/11/2026');
    // sin declaración ni comparación, y sin hablarle al dueño
    expect(button('No cambié')).toBeUndefined();
    expect(text()).not.toContain('Declarado');
    expect(text()).not.toContain('tu lote');
    expect(el().querySelector('.line')).toBeNull();
  });

  it('mientras MODIS responde muestra un esqueleto y avisa que puede tardar', async () => {
    await render(LOT, true, LOADING);

    expect(el().querySelectorAll('.year-skeleton').length).toBe(5);
    expect(el().querySelector('.modis')?.getAttribute('aria-busy')).toBe('true');
    expect(el().querySelector('.note[role="status"]')?.textContent).toContain(
      'MODIS puede tardar un par de minutos',
    );
    // todavía no hay dato: nada que etiquetar como verificado
    expect(el().querySelector('.modis__head app-origin-badge')).toBeNull();
  });

  it('sin dato dice el motivo corto y, si falló, deja reintentar', async () => {
    await render(EXAMPLE, false, ready(NO_DATA));
    expect(visible()).toContain('Sin dato · No hay píxeles sobre el lote');
    expect(help('Cómo lo mide MODIS')).toContain('No hay píxeles de MODIS sobre este lote.');
    expect(el().querySelectorAll('.year').length).toBe(0);
    expect(el().querySelector('.modis__head app-origin-badge')).toBeNull();

    state.set(FAILED);
    await fixture.whenStable();
    expect(visible()).toContain('Sin dato · Sin respuesta del servicio de la NASA');
    expect(el().querySelector('.modis__head app-origin-badge')).toBeNull();
    expect(help('Cómo lo mide MODIS')).toContain('Probá de nuevo en unos minutos.');
    button('Reintentar')?.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('en un ejemplo con un uso distinto lo marca, sin acusar', async () => {
    await render(EXAMPLE, false, ready(CHANGED));

    expect(visible()).toContain('Uso distinto en 2022, 2023 y 2024');
    expect(help('Más sobre lo que vio MODIS')).toContain('error de clasificación');
    const flagged = [...el().querySelectorAll('.year.is-different')];
    expect(flagged.map((y) => y.querySelector('.year__num')?.textContent?.trim())).toEqual([
      '2022',
      '2023',
      '2024',
    ]);
    // la marca no es solo color: un ícono y, para el lector de pantalla, el texto
    expect(flagged.every((y) => y.querySelector('.year__flag'))).toBe(true);
    expect(flagged[0].textContent).toContain('distinto de 2020');
  });

  it('coincide: declaraste sin cambio y MODIS vio el mismo uso', async () => {
    await render({ ...LOT, land_use_declaration: declared(true) }, true, ready(UNCHANGED));

    expect(visible()).toContain('Sin cambio desde 2020');
    expect(visible()).toContain('Declarado por vos el 15/11/2026');
    expect(el().querySelector('.declared__meta app-origin-badge')?.textContent).toContain(
      'Declarado',
    );
    expect(visible()).toContain('Respaldado por lo que vio MODIS');
    expect(el().querySelector('.line--match')?.getAttribute('data-tone')).toBe('ok');
    expect(help('Más sobre la comparación con MODIS')).toContain('vio uso agrícola en cada año');
  });

  it('no coincide: lo marca para revisar, sin acusar, y señala los años distintos', async () => {
    await render({ ...LOT, land_use_declaration: declared(true) }, true, ready(CHANGED));

    expect(visible()).toContain('No coincide con MODIS: revisalo');
    expect(help('Más sobre la comparación con MODIS')).toContain(
      'error de clasificación del satélite',
    );
    expect(el().querySelector('.line--match')?.getAttribute('data-tone')).toBe('warn');
    expect(el().querySelectorAll('.year.is-different').length).toBe(3);
    // la comparación ya lo dice: no se repite la línea de MODIS
    expect(visible()).not.toContain('Uso distinto en');
  });

  it('sin un uso claro en el año base, no dice que no coincide', async () => {
    await render({ ...LOT, land_use_declaration: declared(true) }, true, ready(TIED));

    expect(visible()).toContain('MODIS no alcanza para confirmarlo');
    expect(visible()).not.toContain('No coincide');
    expect(el().querySelector('.line--match')?.getAttribute('data-tone')).toBe('neutral');
    expect([...el().querySelectorAll('.year__label')].map((y) => y.textContent?.trim())).toEqual([
      'Mixto',
      'Mixto',
      'Mixto',
    ]);
    expect(el().querySelectorAll('.year.is-different').length).toBe(0);
  });

  it('declaraste un cambio: dice qué implica para la práctica', async () => {
    await render({ ...LOT, land_use_declaration: declared(false) }, true, ready(UNCHANGED));

    expect(visible()).toContain('Hubo un cambio desde 2020');
    expect(visible()).toContain('Con un cambio, la práctica no se cumple');
    const why = help('Más sobre la comparación con MODIS');
    expect(why).toContain('no cumple la práctica «Sin cambio de uso del suelo desde 2020»');
    expect(why).toContain('MODIS no lo vio');
  });

  it('sin dato de MODIS no compara, y lo dice', async () => {
    await render({ ...LOT, land_use_declaration: declared(true) }, true, ready(NO_DATA));

    expect(visible()).toContain('Sin dato de MODIS para comparar');
    expect(text()).not.toContain('Respaldado');
  });

  it('declara con éxito: guarda, muestra la fecha con su origen y deja cambiarla', async () => {
    const changes: (LandUseDeclaration | null)[] = [];
    fixture.componentInstance.declaration.subscribe((value) => changes.push(value));
    await render(LOT, true, ready(UNCHANGED));
    expect(visible()).toContain('¿Cambió el uso del suelo desde 2020?');

    button('No cambié el uso')?.click();
    await fixture.whenStable();
    const request = http.expectOne('/api/lots/1/land-use/');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ unchanged: true });
    expect(button('Guardando')?.getAttribute('aria-disabled')).toBe('true');
    expect(button('Sí, hubo un cambio')?.getAttribute('aria-disabled')).toBe('true');

    request.flush(declared(true));
    await fixture.whenStable();
    expect(visible()).toContain('Declarado por vos el 15/11/2026');
    expect(el().querySelector('.declared app-origin-badge')?.textContent).toContain('Declarado');
    expect(visible()).toContain('Respaldado por lo que vio MODIS');
    expect(changes).toEqual([declared(true)]);
    expect(el().querySelector('[role="status"]')?.textContent).toContain(
      'Guardamos tu declaración',
    );

    // cambiarla vuelve a mostrar las dos opciones, con la elegida marcada
    button('Cambiar')?.click();
    await fixture.whenStable();
    expect(button('No cambié')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('Sí, hubo un cambio')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(button('No cambié'));
    button('Cancelar')?.click();
    await fixture.whenStable();
    expect(button('No cambié')).toBeUndefined();
    expect(document.activeElement).toBe(button('Cambiar'));
  });

  it('si no se puede guardar, lo dice y reintenta la misma respuesta', async () => {
    await render(LOT, true, ready(UNCHANGED));

    button('Sí, hubo un cambio')?.click();
    await fixture.whenStable();
    http.expectOne('/api/lots/1/land-use/').flush('', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo guardar tu declaración',
    );
    // las opciones siguen ahí, sin "Guardando…"
    expect(button('Sí, hubo un cambio')?.getAttribute('aria-disabled')).toBeNull();

    button('Reintentar')?.click();
    await fixture.whenStable();
    const again = http.expectOne('/api/lots/1/land-use/');
    expect(again.request.body).toEqual({ unchanged: false });
    again.flush(declared(false));
    await fixture.whenStable();
    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(visible()).toContain('Hubo un cambio desde 2020');
  });

  it('sin permiso de edición no ofrece declarar, pero muestra lo declarado', async () => {
    await render(LOT, false, ready(UNCHANGED));
    expect(button('No cambié')).toBeUndefined();
    expect(el().querySelector('.ask')).toBeNull();

    await render({ ...LOT, land_use_declaration: declared(true) }, false, ready(UNCHANGED));
    expect(visible()).toContain('Sin cambio desde 2020');
    expect(button('Cambiar')).toBeUndefined();
  });

  it('con una copia guardada que no se pudo renovar, dice de cuándo es', async () => {
    await render(EXAMPLE, false, ready(UNCHANGED, true));
    expect(visible()).toContain('Orientativo · píxeles de 460 m · copia del 15/11/2026');
  });
});
