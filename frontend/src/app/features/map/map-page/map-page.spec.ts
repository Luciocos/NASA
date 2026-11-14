import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LotSummary } from '../../../core/models';
import { MapPage } from './map-page';

// Lote armado para la prueba: no representa un lote real.
const LOT: LotSummary = {
  id: 7,
  name: 'Lote de prueba',
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
  event_count: 3,
  created_at: '2026-11-14T10:00:00Z',
};

describe('MapPage', () => {
  let fixture: ComponentFixture<MapPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapPage],
      providers: [provideRouter([]), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(MapPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  it('lista los lotes con enlace a su ficha', async () => {
    http.expectOne('/api/lots/').flush([LOT]);
    await fixture.whenStable();
    const link = el().querySelector<HTMLAnchorElement>('aside a');
    expect(link?.textContent?.trim()).toBe('Lote de prueba');
    expect(link?.getAttribute('href')).toBe('/lotes/7');
    expect(el().textContent).toContain('24,9 ha');
    expect(el().textContent).toContain('3 eventos');
  });

  it('incluye la atribución de OpenStreetMap', async () => {
    http.expectOne('/api/lots/').flush([]);
    await fixture.whenStable();
    expect(el().textContent).toContain('OpenStreetMap');
    expect(el().textContent).toContain('Todavía no hay lotes cargados.');
  });
});
