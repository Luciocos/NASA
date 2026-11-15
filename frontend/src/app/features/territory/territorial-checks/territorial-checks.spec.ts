import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LotDetail } from '../../../core/models';
import { TerritorialChecks as ChecksResponse } from '../territory.types';
import { TerritorialChecks } from './territorial-checks';

// lote y chequeos armados para la prueba: no representan un lote real
const LOT: LotDetail = {
  id: 1,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 24.94,
  event_count: 0,
  created_at: '2026-11-14T10:00:00Z',
  is_example: false,
  owned: true,
  campaigns: [],
};

const CHECKS: ChecksResponse = {
  lot: 1,
  disclaimer: 'Cruce con capas públicas, indicativo.',
  checks: [
    {
      key: 'periurban',
      title: 'Distancias de exclusión periurbanas',
      status: 'CLEAR',
      summary: 'El lote está a 4.000 m del área urbana de la prueba.',
      origin: 'OFFICIAL_LAYER',
      sources: [{ name: 'Norma de prueba', publisher: '', url: '', date: '', license: '' }],
      details: {},
    },
    {
      key: 'otbn',
      title: 'Bosque nativo (OTBN, Ley 26.331)',
      status: 'POSSIBLE_CONFLICT',
      summary: 'Alerta: posible desmonte en la prueba.',
      origin: 'OFFICIAL_LAYER',
      sources: [],
      details: { strong_alert: true, land_use_change_declared: true },
    },
    {
      key: 'bpa',
      title: 'Buenas Prácticas Agrícolas provinciales',
      status: 'NO_DATA',
      summary: 'El productor no declaró adhesión a BPA.',
      origin: 'DECLARED',
      sources: [],
      details: {},
    },
  ],
};

const squash = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

describe('TerritorialChecks', () => {
  let fixture: ComponentFixture<TerritorialChecks>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const rows = () => [...el().querySelectorAll<HTMLElement>('.check')];
  /** lo que se ve: sin las ayudas (i) ni lo plegado */
  const visible = () => {
    const clone = el().cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[popover], .visually-hidden, .body').forEach((node) => node.remove());
    return squash(clone.textContent);
  };

  async function render(editable = true, lot: LotDetail = LOT): Promise<void> {
    fixture.componentRef.setInput('lot', lot);
    fixture.componentRef.setInput('editable', editable);
    await fixture.whenStable();
    http.expectOne(`/api/lots/${lot.id}/territorial-checks/`).flush(CHECKS);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TerritorialChecks],
      providers: [provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(TerritorialChecks);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** las partes de la fila: nombre, estado, origen y, si invita a declarar, "Declarar" */
  const parts = (row: HTMLElement) =>
    [
      'summary .name',
      'summary .state',
      'summary app-origin-badge, summary .layer',
      'summary .act',
    ].map((selector) => squash(row.querySelector(selector)?.textContent));

  it('una fila corta por chequeo: nombre, estado con ícono y origen; el resto, plegado', async () => {
    await render();
    expect(rows().map(parts)).toEqual([
      ['Distancia a zonas urbanas', 'Sin conflicto detectado', 'Capa pública', ''],
      ['Bosque nativo (OTBN)', 'Posible desmonte', 'Capa pública', ''],
      // sin dato no hay origen que mostrar
      ['Buenas Prácticas (BPA)', 'Sin declarar', '', 'Declarar'],
    ]);
    // el estado nunca va solo con color
    expect(rows().every((row) => row.querySelector('.state app-icon'))).toBe(true);
    // a la vista no van los resúmenes ni las fuentes; el aviso de indicativo, en una línea
    expect(visible()).not.toContain('4.000 m');
    expect(visible()).not.toContain('Norma de prueba');
    expect(visible()).toContain('Cruce indicativo con capas públicas.');
    // el descargo completo, en el (i)
    expect(squash(el().querySelector('[popover]')?.textContent)).toContain(
      'Cruce con capas públicas, indicativo.',
    );
  });

  it('la alerta fuerte del bosque nativo queda a la vista, con el detalle al abrir la fila', async () => {
    await render();
    const otbn = rows()[1];
    expect(otbn.querySelector('.state')?.classList).toContain('chip--danger');
    expect(squash(otbn.querySelector('.strong')?.textContent)).toBe(
      'Posible desmonte: revisalo con la autoridad provincial.',
    );
    // el detalle propio se arma recién al abrir la fila
    expect(otbn.querySelector('app-otbn-detail')).toBeNull();
    const details = otbn.querySelector('details')!;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    await fixture.whenStable();
    expect(otbn.querySelector('app-otbn-detail')).not.toBeNull();
    expect(squash(otbn.querySelector('.summary')?.textContent)).toContain(
      'Bosque nativo (OTBN, Ley 26.331). Alerta: posible desmonte en la prueba.',
    );
  });

  it('si la alerta sale de un evento simulado, la línea a la vista lo dice', async () => {
    // sin eventos simulados, la línea no lleva la leyenda
    await render();
    expect(rows()[1].querySelector('.strong app-simulated-notice')).toBeNull();

    const otbn = CHECKS.checks[1];
    const simulated: ChecksResponse = {
      ...CHECKS,
      checks: [
        CHECKS.checks[0],
        {
          ...otbn,
          details: {
            ...otbn.details,
            land_use_change_detected: true,
            land_use_change_events: [
              {
                id: 7,
                date: '2022-03-01',
                sensor: 'HLS',
                origin: 'VERIFIED',
                is_simulated: true,
              },
            ],
          },
        },
        CHECKS.checks[2],
      ],
    };
    fixture.componentRef.setInput('lot', { ...LOT, name: 'Lote de prueba 2' });
    await fixture.whenStable();
    http.expectOne('/api/lots/1/territorial-checks/').flush(simulated);
    await fixture.whenStable();
    expect(squash(rows()[1].querySelector('.strong')?.textContent)).toBe(
      'Posible desmonte: revisalo con la autoridad provincial. Dato simulado para la demostración',
    );
  });

  it('sin poder escribir no invita a declarar BPA', async () => {
    await render(false);
    expect(parts(rows()[2])).toEqual(['Buenas Prácticas (BPA)', 'Sin declarar', '', '']);
  });

  it('cuando cambia la ficha (por ejemplo, la declaración de uso del suelo) se vuelven a pedir', async () => {
    await render();
    fixture.componentRef.setInput('lot', {
      ...LOT,
      land_use_declaration: {
        unchanged: false,
        declared_at: '2026-11-15T15:00:00-03:00',
        origin: 'DECLARED',
      },
    });
    await fixture.whenStable();
    http.expectOne('/api/lots/1/territorial-checks/').flush(CHECKS);
    await fixture.whenStable();
    expect(rows().length).toBe(3);
  });

  it('si no cargan, lo dice y deja reintentar', async () => {
    fixture.componentRef.setInput('lot', LOT);
    await fixture.whenStable();
    http
      .expectOne('/api/lots/1/territorial-checks/')
      .flush('', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(squash(el().querySelector('[role="alert"]')?.textContent)).toContain(
      'No se pudieron cargar los chequeos.',
    );
    [...el().querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Reintentar')!
      .click();
    await fixture.whenStable();
    http.expectOne('/api/lots/1/territorial-checks/').flush(CHECKS);
    await fixture.whenStable();
    expect(rows().length).toBe(3);
  });
});
