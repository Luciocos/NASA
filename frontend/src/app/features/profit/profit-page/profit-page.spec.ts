import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { LotDetail } from '../../../core/models';
import { provideOfflineTesting } from '../../../core/offline/testing';
import { CostKey } from '../profit-calc';
import { ProfitPage } from './profit-page';

// lote y huella armados para la prueba: no representan datos reales
const LOT: LotDetail = {
  id: 1,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 10,
  event_count: 0,
  created_at: '2026-11-14T10:00:00Z',
  campaigns: [],
};

function footprint(yieldValue: number | null) {
  return {
    lot: 1,
    campaign: { id: 5, label: '2025/26', crop: 'SOY', crop_origin: 'DECLARED' },
    available_campaigns: [{ id: 5, label: '2025/26' }],
    total_kg_co2e_per_t: null,
    yield: {
      value: yieldValue,
      unit: 't/ha',
      origin: yieldValue === null ? null : 'DECLARED',
      reason: null,
      reference: null,
    },
    components: [],
  };
}

describe('ProfitPage', () => {
  let fixture: ComponentFixture<ProfitPage>;
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';

  async function setup(yieldValue: number | null): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProfitPage],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        provideOfflineTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfitPage);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/lots/1/').flush(LOT);
    http.expectOne('/api/lots/1/footprint/').flush(footprint(yieldValue));
    await fixture.whenStable();
  }

  it('sin rinde ni precio no escribe la unidad al lado de "Sin dato"', async () => {
    await setup(null);
    expect(text()).toContain('Sin dato');
    expect(text()).not.toContain('Sin dato t/ha');
  });

  it('si solo falta el precio, la frase cierra sin espacios de más', async () => {
    await setup(3);
    expect(text()).toContain('falta: el precio del grano.');
  });

  it('con un solo costo sin cargar lo dice en singular', async () => {
    await setup(3);
    const page = fixture.componentInstance as unknown as {
      setPrice(raw: string): void;
      setCost(key: CostKey, raw: string): void;
    };
    page.setPrice('300');
    const loaded: CostKey[] = ['seed', 'fertilizer', 'pesticide', 'labor', 'harvest', 'rent'];
    for (const key of loaded) page.setCost(key, '10');
    await fixture.whenStable();
    expect(text()).toContain('Hay 1 costo sin cargar');
  });
});
