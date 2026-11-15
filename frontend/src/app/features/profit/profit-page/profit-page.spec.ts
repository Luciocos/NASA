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

function footprint(yieldValue: number | null, withCampaign = true) {
  return {
    lot: 1,
    campaign: withCampaign
      ? { id: 5, label: '2025/26', crop: 'SOY', crop_origin: 'DECLARED' }
      : null,
    available_campaigns: withCampaign ? [{ id: 5, label: '2025/26' }] : [],
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

interface PageApi {
  setPrice(raw: string): void;
  setYield(raw: string): void;
  setCommercial(raw: string): void;
  setCost(key: CostKey, raw: string): void;
}

describe('ProfitPage', () => {
  let fixture: ComponentFixture<ProfitPage>;
  let http: HttpTestingController;
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  const page = () => fixture.componentInstance as unknown as PageApi;
  /** los números grandes del margen: por hectárea y del lote */
  const amounts = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.hero .amount')).map((el) =>
      el.textContent?.trim(),
    );

  async function start(): Promise<void> {
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
    http = TestBed.inject(HttpTestingController);
  }

  async function setup(yieldValue: number | null, withCampaign = true): Promise<void> {
    await start();
    http.expectOne('/api/lots/1/').flush(LOT);
    http.expectOne('/api/lots/1/footprint/').flush(footprint(yieldValue, withCampaign));
    await fixture.whenStable();
  }

  it('sin rinde ni precio no escribe la unidad al lado de "Sin dato"', async () => {
    await setup(null);
    expect(text()).toContain('Sin dato');
    expect(text()).not.toContain('Sin dato t/ha');
    expect(text()).toContain('Faltan el precio del grano y el rinde.');
  });

  it('si solo falta el precio, lo dice como motivo del margen', async () => {
    await setup(3);
    expect(text()).toContain('Falta el precio del grano.');
  });

  it('con precio y rinde muestra el margen por hectárea y del lote', async () => {
    await setup(3);
    page().setPrice('300');
    await fixture.whenStable();
    // 3 t/ha x 300 US$/t = 900 US$/ha, en 10 ha
    expect(amounts()).toEqual(['900', '9.000']);
    expect(text()).toContain('Todavía sin costos');
  });

  it('con un solo costo sin cargar lo dice en singular', async () => {
    await setup(3);
    page().setPrice('300');
    page().setCommercial('20');
    const loaded: CostKey[] = ['seed', 'fertilizer', 'pesticide', 'labor', 'harvest', 'rent'];
    for (const key of loaded) page().setCost(key, '10');
    await fixture.whenStable();
    expect(text()).toContain('Falta 1 costo por cargar');
  });

  it('el rinde que carga el productor reemplaza al de la huella y al borrarlo vuelve', async () => {
    await setup(3);
    page().setPrice('100');
    page().setYield('4,5');
    await fixture.whenStable();
    expect(amounts()).toEqual(['450', '4.500']);
    expect(text()).toContain('Lo cargaste vos.');
    page().setYield('');
    await fixture.whenStable();
    expect(amounts()).toEqual(['300', '3.000']);
    expect(text()).toContain('De tu declaración en la huella.');
  });

  it('sin campañas igual calcula con el rinde que se carga a mano', async () => {
    await setup(null, false);
    expect(text()).toContain('el lote todavía no tiene campañas');
    page().setPrice('200');
    page().setYield('2');
    await fixture.whenStable();
    expect(amounts()).toEqual(['400', '4.000']);
  });

  it('un lote ajeno o inexistente invita a ingresar', async () => {
    await start();
    http.expectOne('/api/lots/1/').flush('', { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/lots/1/footprint/').flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-login-invite')).not.toBeNull();
    expect(el.querySelector('app-lot-tabs')).toBeNull();
  });
});
