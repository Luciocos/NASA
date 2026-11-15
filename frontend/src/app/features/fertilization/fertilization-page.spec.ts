import { Component, input, signal } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { LotDetail } from '../../core/models';
import { LoadState, LotSatellite, NdviGrid, NdviZones, zonesByTerciles } from '../../core/nasa';
import { provideOfflineTesting } from '../../core/offline/testing';
import { OriginBadge } from '../../shared/origin-badge/origin-badge';
import { formatDate } from '../lot/labels';
import { FertilizationPage } from './fertilization-page';
import { ZonesMap } from './zones-map';

// lote y NDVI armados para la prueba: no representan datos reales
const LOT: LotDetail = {
  id: 1,
  name: 'Lote de prueba',
  renspa: '',
  locality: '',
  province: '',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 10,
  event_count: 0,
  created_at: '2026-11-14T10:00:00Z',
  campaigns: [],
};

const GRID: NdviGrid = {
  date: '2026-10-16',
  satellite: 'Terra',
  cellSizeM: 231.66,
  pixels: [0.2, 0.3, 0.5, 0.6, 0.8, 0.9].map((value) => ({
    ring: [],
    center: [0, 0],
    value,
    reliability: 0,
    inside: true,
  })),
};

function ready(data: NdviGrid): LoadState<NdviGrid> {
  return { status: 'ready', data, progress: 1, stale: false, updatedAt: null, error: null };
}

/** el mapa real usa Leaflet: en la prueba alcanza con saber qué ambientes recibe */
@Component({ selector: 'app-zones-map', template: '' })
class ZonesMapStub {
  readonly geometry = input<unknown>();
  readonly zones = input<NdviZones | null>(null);
}

describe('FertilizationPage', () => {
  let fixture: ComponentFixture<FertilizationPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  /** el origen de cada rótulo de un bloque, sin depender del texto del rótulo */
  const origins = (selector: string) =>
    fixture.debugElement
      .queryAll(By.css(`${selector} app-origin-badge`))
      .map((badge) => (badge.componentInstance as OriginBadge).origin());

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FertilizationPage],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        provideOfflineTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } },
        {
          provide: LotSatellite,
          useValue: { ndviGrid: () => signal(ready(GRID)).asReadonly(), retry: () => undefined },
        },
      ],
    })
      .overrideComponent(FertilizationPage, {
        remove: { imports: [ZonesMap] },
        add: { imports: [ZonesMapStub] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(FertilizationPage);
    await fixture.whenStable();
    http = TestBed.inject(HttpTestingController);
  });

  it('muestra los tres ambientes con su superficie, la fecha de MODIS y su origen', async () => {
    http.expectOne('/api/lots/1/').flush(LOT);
    http.expectOne('/api/lots/1/footprint/').flush({ components: [] });
    await fixture.whenStable();
    expect(el().querySelectorAll('.zones app-kpi-card')).toHaveLength(3);
    expect(text()).toContain(zonesByTerciles(GRID).zones[0].label);
    expect(text()).toContain('33 % of the field');
    // a la vista, en una línea con su origen; que es un compuesto de 16 días, en el (i)
    const date = formatDate(GRID.date);
    expect(el().querySelector('.source-line')?.textContent).toContain(`MODIS · image from ${date}`);
    expect(el().querySelector('app-info-tip')?.textContent).toContain(`composite from ${date}`);
    expect(origins('.source-line')).toEqual(['VERIFIED']);
    // una sola acción principal
    expect(el().querySelectorAll('.btn--primary')).toHaveLength(1);
  });

  it('la acción principal abre la planilla y las dosis cargadas dan el total de nitrógeno', async () => {
    http.expectOne('/api/lots/1/').flush(LOT);
    http.expectOne('/api/lots/1/footprint/').flush({ components: [] });
    await fixture.whenStable();
    const planner = () =>
      el().querySelector('.planner app-disclosure details') as HTMLDetailsElement;
    expect(planner().open).toBe(false);
    (el().querySelector('.btn--primary') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(planner().open).toBe(true);

    const inputs = el().querySelectorAll<HTMLInputElement>('.dose input');
    ['100', '80', '60'].forEach((value, i) => {
      inputs[i].value = value;
      inputs[i].dispatchEvent(new Event('input'));
    });
    await fixture.whenStable();
    // 10 ha en tres tercios: 100, 80 y 60 kg N/ha dan 800 kg de N, 80 de promedio
    expect(text()).toContain('With your variable rate');
    expect(text()).toContain('800 kg N');
    expect(text()).toContain('Average 80 kg N/ha');
    expect(origins('.summary')).toContain('DECLARED');
  });

  it('un lote ajeno o inexistente invita a ingresar', async () => {
    http.expectOne('/api/lots/1/').flush('', { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/lots/1/footprint/').flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(el().querySelector('app-login-invite')).not.toBeNull();
    expect(el().querySelector('app-zones-map')).toBeNull();
  });

  it('embebida en el popup toma el id del input, sin pestañas ni encabezado propios', async () => {
    const embedded = TestBed.createComponent(FertilizationPage);
    embedded.componentRef.setInput('id', 2);
    embedded.componentRef.setInput('embedded', true);
    await embedded.whenStable();
    // el input manda sobre el :id de la ruta
    http.expectOne('/api/lots/2/').flush({ ...LOT, id: 2 });
    http.expectOne('/api/lots/2/footprint/').flush({ components: [] });
    await embedded.whenStable();

    const host = embedded.nativeElement as HTMLElement;
    expect(host.classList).toContain('is-embedded');
    expect(host.querySelector('app-lot-tabs')).toBeNull();
    expect(host.querySelector('app-page-header')).toBeNull();
    expect(host.querySelectorAll('.zones app-kpi-card')).toHaveLength(3);
    // la acción principal pasa a la planilla: sigue siendo una sola
    expect(host.querySelectorAll('.btn--primary')).toHaveLength(1);
    expect(host.querySelector('.planner .btn--primary')?.textContent).toContain('Plan rates');
    // cómo se arman los ambientes queda detrás de un (i)
    expect(host.querySelector('button[aria-label="How the zones are built"]')).toBeTruthy();
  });

  it('embebida, la planilla cerrada no repite la acción: "Plan rates" la abre y la vuelve a dar', async () => {
    const embedded = TestBed.createComponent(FertilizationPage);
    embedded.componentRef.setInput('id', 2);
    embedded.componentRef.setInput('embedded', true);
    await embedded.whenStable();
    http.expectOne('/api/lots/2/').flush({ ...LOT, id: 2 });
    http.expectOne('/api/lots/2/footprint/').flush({ components: [] });
    await embedded.whenStable();

    const host = embedded.nativeElement as HTMLElement;
    const planner = () =>
      [...host.querySelectorAll<HTMLDetailsElement>('.planner app-disclosure details')].find(
        (details) => details.querySelector('summary')?.textContent?.includes('Rate by zone'),
      );
    const armar = () => host.querySelector<HTMLButtonElement>('.planner .btn--primary');
    expect(planner()).toBeUndefined();

    armar()!.click();
    await embedded.whenStable();
    expect(planner()?.open).toBe(true);
    expect(armar()).toBeNull();

    // al cerrarla con su rótulo vuelve "Plan rates", con el foco
    planner()!.open = false;
    planner()!.dispatchEvent(new Event('toggle'));
    await embedded.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    expect(planner()).toBeUndefined();
    expect(armar()).not.toBeNull();
    expect(document.activeElement).toBe(armar());
  });
});
