import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { provideSignedInTesting } from '../../core/auth/testing';
import { EventLogItem, LotSummary, PolygonGeometry } from '../../core/models';
import { provideNasaTesting } from '../../core/nasa/testing';
import { provideOfflineTesting } from '../../core/offline/testing';
import { ExamplesPage } from './examples-page';
import { outlinePath } from './outline';

// lotes y evento armados para la prueba: no representan datos reales
const SQUARE: PolygonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-61.2, -33.05],
      [-61.19, -33.05],
      [-61.19, -33.04],
      [-61.2, -33.04],
      [-61.2, -33.05],
    ],
  ],
};
const LOT: LotSummary = {
  id: 1,
  name: 'Lote 1',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: SQUARE,
  area_ha: 24.94,
  event_count: 1,
  created_at: '2026-11-14T10:00:00Z',
  is_example: true,
  owned: false,
};
const EVENT: EventLogItem = {
  id: 10,
  lot: 1,
  campaign: null,
  type: 'TILLAGE',
  date: '2026-10-12',
  date_uncertainty_days: null,
  sensor: 'NISAR',
  origin: 'VERIFIED',
  confidence: null,
  evidence_image: '',
  evidence_optical_image: '',
  metrics: {},
  is_simulated: true,
  notes: '',
  campaign_label: null,
  type_label: 'Remoción de suelo',
  sensor_label: 'NISAR',
  evidence_image_url: null,
  evidence_optical_image_url: null,
};

describe('ExamplesPage', () => {
  let fixture: ComponentFixture<ExamplesPage>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const headerAction = (): HTMLAnchorElement => el().querySelector('app-page-header a.btn')!;

  async function setup(signedIn = false): Promise<void> {
    TestBed.configureTestingModule({
      imports: [ExamplesPage],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        ...provideNasaTesting(),
        signedIn ? provideSignedInTesting() : provideOfflineTesting(),
      ],
    });
    fixture = TestBed.createComponent(ExamplesPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  }

  /** responde la lista y, por cada lote, su ficha y su bitácora */
  async function flushExamples(lots: LotSummary[], events: EventLogItem[] = []): Promise<void> {
    http.expectOne('/api/examples/').flush(lots);
    for (const lot of lots) {
      http.expectOne(`/api/lots/${lot.id}/`).flush({ ...lot, campaigns: [] });
      const own = events.filter((event) => event.lot === lot.id);
      http
        .expectOne(`/api/lots/${lot.id}/events/`)
        .flush({ lot: lot.id, count: own.length, message: null, events: own });
    }
    await fixture.whenStable();
  }

  afterEach(() => http.verify());

  it('explica en una línea qué son y muestra cada lote con enlace a su historia', async () => {
    await setup();
    expect(el().querySelector('[aria-busy="true"]')).not.toBeNull();

    await flushExamples([LOT, { ...LOT, id: 2, name: 'Lote 2', event_count: 0 }], [EVENT]);

    expect(el().querySelector('h1')?.textContent).toContain('Sample fields');
    expect(el().textContent).toContain("seen by NASA's NISAR radar");
    expect(el().textContent).toContain('Read-only.');
    const cards = el().querySelectorAll('.example');
    expect(cards).toHaveLength(2);
    const first = cards[0];
    // la tarjeta abre el lote en el popup, encima de la lista
    expect(first.querySelector('h2 a')?.getAttribute('href')).toBe('/?lote=1');
    expect(first.querySelector('h2 a')?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(first.textContent).toContain('Casilda, Santa Fe');
    expect(first.textContent).toContain('Remoción de suelo');
    // el último evento en una sola línea, con su origen al lado
    expect(first.querySelectorAll('.example__last')).toHaveLength(1);
    expect(first.querySelector('.example__last app-origin-badge')).not.toBeNull();
    expect(first.textContent).toContain('Simulated data for the demo');
    expect(first.querySelector('.example__shape path')?.getAttribute('d')).toMatch(/^M.+Z$/);
    expect(cards[1].querySelector('.example__last')?.textContent?.trim()).toBe('No events yet');
  });

  it('sin cuenta invita a crearla; con la sesión abierta, a marcar su lote', async () => {
    await setup();
    await flushExamples([]);
    expect(headerAction().textContent).toContain('Sign up for free');
    expect(headerAction().getAttribute('href')).toBe('/registrarse');
    expect(el().textContent).toContain('No sample fields loaded yet.');

    TestBed.resetTestingModule();
    await setup(true);
    await flushExamples([]);
    expect(headerAction().textContent).toContain('Add my field');
    expect(headerAction().getAttribute('href')).toBe('/mapa/nuevo');
  });

  it('"Ver su historia" abre el lote en el popup, encima de la lista y de solo lectura', async () => {
    await setup();
    await flushExamples([LOT], [EVENT]);

    el().querySelector<HTMLAnchorElement>('.example h2 a')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/?lote=1');
    const dialog = el().querySelector('dialog.lot-dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);

    http.expectOne('/api/lots/1/').flush({ ...LOT, is_example: true, owned: false, campaigns: [] });
    await fixture.whenStable();
    http.expectOne('/api/lots/1/events/').flush({ lot: 1, count: 0, message: null, events: [] });
    await fixture.whenStable();
    expect(dialog?.querySelector('h2#lot-title-1')?.textContent).toContain(LOT.name);
    expect(dialog?.textContent).toContain('Sample field · read-only');
    // la lista sigue detrás
    expect(el().querySelectorAll('li.example')).toHaveLength(1);
  });

  it('si no se pudieron cargar lo dice y deja reintentar', async () => {
    await setup();
    http.expectOne('/api/examples/').error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(el().querySelector('.empty')?.textContent).toContain(
      "We couldn't load the sample fields.",
    );
    el().querySelector<HTMLButtonElement>('.empty button')!.click();
    await fixture.whenStable();

    await flushExamples([LOT]);
    expect(el().querySelectorAll('.example')).toHaveLength(1);
  });
});

describe('outlinePath', () => {
  it('dibuja el contorno centrado en la caja, con el norte arriba', () => {
    const path = outlinePath(SQUARE)!;
    const points = [...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(([, x, y]) => [+x, +y]);

    expect(path.endsWith('Z')).toBe(true);
    expect(points).toHaveLength(5);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(90);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(90);
    }
    // el primer punto es la esquina sur: queda abajo
    expect(points[0][1]).toBeGreaterThan(points[2][1]);
  });

  it('sin una forma que dibujar devuelve null', () => {
    expect(outlinePath(null)).toBeNull();
    expect(outlinePath({ type: 'Polygon', coordinates: [] })).toBeNull();
    expect(
      outlinePath({
        type: 'Polygon',
        coordinates: [
          [
            [-61.2, -33.05],
            [-61.2, -33.05],
            [-61.2, -33.05],
          ],
        ],
      }),
    ).toBeNull();
  });
});
