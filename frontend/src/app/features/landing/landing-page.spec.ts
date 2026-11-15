import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideSignedInTesting } from '../../core/auth/testing';
import { EventLogItem, LotSummary } from '../../core/models';
import { provideOfflineTesting } from '../../core/offline/testing';
import { LandingPage } from './landing-page';

// lotes y evento armados para la prueba: no representan datos reales
const LOT: LotSummary = {
  id: 1,
  name: 'Lote 1',
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
  is_example: true,
  owned: false,
};
const EVENT: EventLogItem = {
  id: 10,
  lot: 1,
  campaign: null,
  type: 'SOWING',
  date: '2026-10-12',
  date_uncertainty_days: 6,
  sensor: 'NISAR',
  origin: 'VERIFIED',
  confidence: null,
  evidence_image: '',
  evidence_optical_image: '',
  metrics: {},
  is_simulated: true,
  notes: '',
  campaign_label: null,
  type_label: 'Siembra',
  sensor_label: 'NISAR',
  evidence_image_url: null,
  evidence_optical_image_url: null,
};

describe('LandingPage', () => {
  let fixture: ComponentFixture<LandingPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const sceneLabel = () => el().querySelector('canvas')?.getAttribute('aria-label');

  const links = (): Record<string, string | null> =>
    Object.fromEntries(
      [...el().querySelectorAll<HTMLAnchorElement>('a.cta, a.ghost')].map((a) => [
        a.textContent!.trim(),
        a.getAttribute('href'),
      ]),
    );

  async function setup(signedIn = false): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [LandingPage],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        signedIn ? provideSignedInTesting() : provideOfflineTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LandingPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  }

  afterEach(() => http.verify());

  it('nombra los lotes que dibuja la maqueta y marca el último evento simulado', async () => {
    await setup();
    http
      .expectOne('/api/examples/')
      .flush([LOT, { ...LOT, id: 2, name: 'Lote 2', event_count: 0 }]);
    for (const req of http.match((r) => /\/api\/lots\/\d+\/$/.test(r.url))) {
      req.flush({ ...LOT, campaigns: [] });
    }
    http
      .expectOne('/api/lots/1/events/')
      .flush({ lot: 1, count: 1, message: null, events: [EVENT] });
    http.expectOne('/api/lots/2/events/').flush({ lot: 2, count: 0, message: null, events: [] });
    await fixture.whenStable();

    expect(sceneLabel()).toBe('Maqueta isométrica de 2 lotes reales de Casilda, Santa Fe');
    expect(el().querySelector('.hero__stage')?.hasAttribute('aria-label')).toBe(false);
    expect(el().querySelector('.callout')?.textContent).toContain(
      'Dato simulado para la demostración',
    );
  });

  it('si no hay lotes, la maqueta no promete ninguno', async () => {
    await setup();
    http.expectOne('/api/examples/').error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(sceneLabel()).toBe('Maqueta isométrica de la zona, sin lotes para mostrar');
    expect(el().querySelector('.stage-note')?.textContent).toContain(
      'Los lotes de ejemplo aparecen cuando hay conexión.',
    );
  });

  it('sin sesión invita a crear la cuenta gratis o a ingresar', async () => {
    await setup();
    http.expectOne('/api/examples/').flush([]);
    await fixture.whenStable();

    expect(links()).toEqual({
      'Crear cuenta gratis': '/registrarse',
      'Ya tengo cuenta': '/ingresar',
    });
    expect(el().textContent).not.toContain('Probar demo');
  });

  it('con la sesión abierta lleva a su campo', async () => {
    await setup(true);
    http.expectOne('/api/examples/').flush([]);
    await fixture.whenStable();

    expect(links()['Ir a mi campo']).toBe('/mapa');
    expect(el().textContent).not.toContain('Crear cuenta gratis');
  });
});
