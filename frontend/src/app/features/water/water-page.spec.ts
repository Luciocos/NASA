import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { LotDetail } from '../../core/models';
import { provideOfflineTesting } from '../../core/offline/testing';
import { WaterPage } from './water-page';
import { WaterAnalysis, WaterSimulation } from './water.types';

// lote, cuenca y simulación armados para la prueba: no representan datos reales
const SQUARE = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-61.2, -33.08],
      [-61.19, -33.08],
      [-61.19, -33.09],
      [-61.2, -33.09],
      [-61.2, -33.08],
    ],
  ],
};

const LOT: LotDetail = {
  id: 3,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: SQUARE,
  area_ha: 90,
  event_count: 0,
  created_at: '2026-11-14T10:00:00Z',
  campaigns: [],
};

const ANALYSIS = {
  available: true,
  lot: 3,
  configured_for: 'Lote 3',
  outlet: { lat: -33.081, lng: -61.193, elevation_m: 78.2 },
  basin: {
    area_ha: 45.9,
    outside_lot_ha: 24.8,
    lot_share: 0.46,
    subbasins: 3,
    mean_slope_pct: 0.26,
    relief_m: 2,
    elevation_range_m: [79.2, 81.3],
    hydraulic_length_m: 2225,
    stream_length_m: 1993,
    osm_length_m: 0,
    touches_window_edge: false,
    dem_only_area_ha: 45.9,
    geometry: SQUARE,
    land_cover: [{ igbp: 12, label: 'Cultivos', area_ha: 45.9, share: 1 }],
    cn_arc_ii: 75,
  },
  contributing: {
    area_ha: 132,
    lot_ha: 87,
    outside_lot_ha: 45,
    touches_window_edge: false,
    geometry: SQUARE,
  },
  subbasins: [],
  streams: { type: 'FeatureCollection', features: [] },
  osm_waterways: { type: 'FeatureCollection', features: [] },
  entries: [{ kind: 'entry', lat: -33.089, lng: -61.19, upstream_ha: 20.3 }],
  exits: [{ kind: 'exit', lat: -33.081, lng: -61.193, upstream_ha: 45.9 }],
  subbasin_threshold_ha: 7.7,
  flow_arrows: [],
  inspection: { sectors: [], method: 'Método de prueba.', limitation: 'Límite de prueba.' },
  layers: {
    bounds: [
      [-33.2, -61.3],
      [-33.0, -61.1],
    ],
    flow_accumulation: '/media/a.png',
    twi: '/media/b.png',
    depressions: '/media/c.png',
  },
  soil: { hsg: 'B', hsg_counts: { B: 9 }, points: [], source: 's', method: 'm', limitation: 'l' },
  parameters: { terrain: {}, methods: {}, cover_assumption: 'c', curve_number_source: 'TR-55' },
  sources: {
    dem: { name: 'DEM', provider: 'p', note: 'n' },
    osm: { name: 'OSM', count: 0, downloaded: '2026-11-15' },
    land_cover: null,
    generated_at: '2026-11-15T14:00:00+00:00',
  },
  limitations: ['Sin caudales medidos.'],
} as unknown as WaterAnalysis;

const SIMULATION = {
  available: true,
  scenario: {
    rain_mm: 60,
    duration_h: 6,
    distribution: 'uniforme',
    arc: 'II',
    hsg: 'B',
    residue: true,
    kind: 'Escenario hipotético',
  },
  outlet: ANALYSIS.outlet,
  basin_area_ha: 45.9,
  result: {
    rain_mm: 60,
    runoff_mm: 14.5,
    runoff_coefficient: 0.24,
    volume_m3: 6665,
    peak_m3s: 0.316,
    time_to_peak_h: 8.5,
    lag_h: 3.6,
    cn_arc_ii: 75,
    arc: 'II',
    hsg: 'B',
    step_h: 0.5,
    hydrograph: { times_h: [0, 0.5, 1], flow_m3s: [0, 0.3, 0.1] },
    hyetograph_mm: [10, 10],
    notes: [],
  },
  range: {
    I: { runoff_mm: 2.2, volume_m3: 1011, peak_m3s: 0.05 },
    II: { runoff_mm: 14.5, volume_m3: 6665, peak_m3s: 0.316 },
    III: { runoff_mm: 32.1, volume_m3: 14742, peak_m3s: 0.648 },
  },
  method: 'SCS-CN.',
  disclaimer: 'Escenario hipotético, no es un pronóstico meteorológico.',
} as unknown as WaterSimulation;

describe('WaterPage', () => {
  let fixture: ComponentFixture<WaterPage>;
  let http: HttpTestingController;
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      b.textContent?.includes(label),
    );

  async function start(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [WaterPage],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        provideOfflineTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '3' })) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(WaterPage);
    await fixture.whenStable();
    http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/lots/3/').flush(LOT);
  }

  afterEach(() => http.verify());

  it('muestra la cuenca que aporta al lote, con su origen y el aviso de que no está validado', async () => {
    await start();
    http.expectOne('/api/lots/3/hydrology/').flush(ANALYSIS);
    await fixture.whenStable();
    expect(text()).toContain('132 ha aportan agua al lote');
    expect(text()).toContain('45 ha están fuera del lote');
    expect(text()).toContain('sin validar');
    expect(text()).toContain('Estimado');
    expect(text()).not.toContain('Configurado para');
  });

  it('avisa cuando el lote está fuera de la zona procesada', async () => {
    await start();
    http
      .expectOne('/api/lots/3/hydrology/')
      .flush(
        { available: false, detail: 'Este lote queda fuera de la zona procesada.' },
        { status: 404, statusText: 'Not Found' },
      );
    await fixture.whenStable();
    expect(text()).toContain('fuera de la zona procesada');
    expect(text()).not.toContain('aportan agua al lote');
  });

  it('simula una lluvia hipotética y la marca como escenario, no pronóstico', async () => {
    await start();
    http.expectOne('/api/lots/3/hydrology/').flush(ANALYSIS);
    await fixture.whenStable();
    button('Simulador de lluvia')?.click();
    await fixture.whenStable();
    const req = http.expectOne('/api/lots/3/hydrology/simulate/');
    expect(req.request.body).toEqual({ rain_mm: 60, duration_h: 6, arc: 'II', residue: true });
    req.flush(SIMULATION);
    await fixture.whenStable();
    expect(text()).toContain('Escenario hipotético');
    expect(text()).toContain('6.665');
    expect(text()).toContain('no es un pronóstico meteorológico');
  });

  it('recalcula la cuenca desde el punto de salida elegido en el mapa', async () => {
    await start();
    http.expectOne('/api/lots/3/hydrology/').flush(ANALYSIS);
    await fixture.whenStable();
    (fixture.componentInstance as unknown as { pickOutlet(p: object): void }).pickOutlet({
      lat: -33.1,
      lng: -61.2,
    });
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === '/api/lots/3/hydrology/');
    expect(req.request.params.get('lat')).toBe('-33.1');
    expect(req.request.params.get('lng')).toBe('-61.2');
    req.flush(ANALYSIS);
    await fixture.whenStable();
    expect(button('Volver a la salida del lote')).toBeDefined();
  });
});
