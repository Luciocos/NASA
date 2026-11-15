import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DemoAccount } from '../../../core/account/demo-account';
import { LotSummary } from '../../../core/models';
import { provideOfflineTesting } from '../../../core/offline/testing';
import { MapPage } from './map-page';
import { provideNasaTesting } from '../../../core/nasa/testing';

// lotes armados para la prueba: no representan lotes reales
const GEOMETRY: LotSummary['geometry'] = {
  type: 'Polygon',
  coordinates: [
    [
      [-61.2, -33.05],
      [-61.19, -33.05],
      [-61.19, -33.04],
      [-61.2, -33.05],
    ],
  ],
};
const MINE: LotSummary = {
  id: 7,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: GEOMETRY,
  area_ha: 24.94,
  event_count: 3,
  created_at: '2026-11-14T10:00:00Z',
};
const EXAMPLE: LotSummary = { ...MINE, id: 2, name: 'Lote 1', event_count: 0 };
const OTHER: LotSummary = { ...MINE, id: 9, name: 'Lote de otra persona' };

describe('MapPage', () => {
  let fixture: ComponentFixture<MapPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  async function setup(owned: number[]): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MapPage],
      providers: [
        provideRouter([]),
        ...provideNasaTesting(),
        provideHttpClientTesting(),
        provideOfflineTesting(),
      ],
    }).compileComponents();
    const account = TestBed.inject(DemoAccount);
    owned.forEach((id) => account.addLot(id));
    fixture = TestBed.createComponent(MapPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  }

  function flushDetails(): void {
    for (const req of http.match((r) => /\/api\/lots\/\d+\/$/.test(r.url))) {
      req.flush({ ...MINE, campaigns: [] });
    }
    for (const req of http.match((r) => /\/events\/$/.test(r.url))) {
      req.flush({ lot: 7, count: 0, message: null, events: [] });
    }
  }

  it('muestra los lotes de la cuenta y los de ejemplo, no los de otras personas', async () => {
    await setup([7]);
    http.expectOne('/api/lots/').flush([MINE, EXAMPLE, OTHER]);
    await fixture.whenStable();
    flushDetails();
    await fixture.whenStable();

    const text = el().textContent ?? '';
    expect(text).toContain('Lote de prueba');
    expect(text).toContain('24,9 ha');
    expect(text).toContain('3 eventos');
    expect(text).toContain('Lotes de ejemplo de la zona');
    expect(text).toContain('Lote 1');
    expect(text).not.toContain('Lote de otra persona');
  });

  it('invita a marcar el primer lote si la cuenta no tiene ninguno', async () => {
    await setup([]);
    http.expectOne('/api/lots/').flush([EXAMPLE]);
    await fixture.whenStable();
    flushDetails();
    await fixture.whenStable();
    expect(el().textContent).toContain('Todavía no marcaste lotes');
    expect(el().querySelector('a[href="/mapa/nuevo"]')).toBeTruthy();
  });

  it('avisa si no se pudieron cargar los lotes', async () => {
    await setup([]);
    http.expectOne('/api/lots/').flush('error', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(el().querySelector('[role=alert]')?.textContent).toContain('No se pudieron cargar');
  });
});
