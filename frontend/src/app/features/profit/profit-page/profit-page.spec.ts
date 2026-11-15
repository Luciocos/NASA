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
  /** lo que se ve de un bloque: sin el contenido de las ayudas (i) */
  const visible = (selector: string) => {
    const node = (fixture.nativeElement as HTMLElement).querySelector(selector);
    const clone = node?.cloneNode(true) as HTMLElement | undefined;
    clone?.querySelectorAll('[popover], .visually-hidden').forEach((item) => item.remove());
    return (clone?.textContent ?? '').replace(/\s+/g, ' ').trim();
  };
  /** un botón por su nombre accesible: el aria-label o el texto */
  const buttonNamed = (name: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
    );
  /** los números grandes del margen: por hectárea y del lote */
  const amounts = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.hero .amount')).map((el) =>
      el.textContent?.trim(),
    );

  /** como página toma el id de la ruta; embebida (en el popup del lote), del input */
  async function start(inputs: Record<string, unknown> = {}): Promise<void> {
    const params = 'id' in inputs ? {} : { id: '1' };
    await TestBed.configureTestingModule({
      imports: [ProfitPage],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        provideOfflineTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap(params)) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfitPage);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
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

  it('carga el precio sugerido de Rofex, lo marca como estimado y avisa si es de prueba', async () => {
    await setup(3);
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => b.textContent?.includes('Usar precio sugerido de Rofex'));
    expect(button).toBeDefined();
    button!.click();
    http
      .expectOne(
        (req) =>
          req.url === '/api/market/suggested-price/' &&
          req.params.get('crop') === 'SOY' &&
          req.params.get('campaign') === '2025/26',
      )
      .flush({
        crop: 'SOY',
        symbol: 'SOJ.ROS/MAY26',
        price_usd_t: 300,
        kind: 'settlement',
        date: '2026-11-13',
        environment: 'REMARKET',
        simulated_market: true,
        source: 'Matba Rofex',
        disclaimer: 'Precio sugerido de mercado.',
      });
    await fixture.whenStable();
    expect(amounts()).toEqual(['900', '9.000']);
    expect(text()).toContain('Precio sugerido de mercado: US$ 300/t, ajuste del 13/11/2026');
    expect(text()).toContain('SOJ.ROS/MAY26');
    expect(text()).toContain('no es un precio real de mercado');
    expect(text()).toContain('Estimado');
    // a la vista, una línea con la fuente y la fecha, y el aviso de prueba en un chip
    expect(visible('.suggest')).toBe('Sugerido por Matba Rofex · 13/11/2026 Precio de prueba');
    // el margen sale de un precio de prueba: también lo dice
    expect(visible('.hero')).toContain('Con el precio de prueba de Rofex');
    // si el productor lo cambia, pasa a ser declarado y el sugerido queda a mano con "Usar"
    page().setPrice('310');
    await fixture.whenStable();
    expect(text()).not.toContain('Estimado');
    expect(visible('.suggest')).toBe('Rofex: US$ 300/t · 13/11/2026 Usar Precio de prueba');
    buttonNamed('Usar el precio sugerido de Rofex')!.click();
    await fixture.whenStable();
    expect(amounts()).toEqual(['900', '9.000']);
    expect(text()).toContain('Estimado');
  });

  it('sin credenciales en el servidor muestra el motivo', async () => {
    await setup(3);
    (fixture.componentInstance as unknown as { loadSuggestedPrice(): void }).loadSuggestedPrice();
    http
      .expectOne((req) => req.url === '/api/market/suggested-price/')
      .flush(
        { detail: 'El servidor no tiene configurada la conexión con Matba Rofex.' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await fixture.whenStable();
    expect(text()).toContain('no tiene configurada la conexión');
    // a la vista, el motivo corto; el mensaje del servidor, en el (i)
    expect(visible('.suggest')).toBe('Sin precio de Rofex Reintentar');
  });

  it('el precio sugerido de otra campaña no queda rotulando el precio nuevo', async () => {
    await start();
    http.expectOne('/api/lots/1/').flush(LOT);
    const two = {
      ...footprint(3),
      available_campaigns: [
        { id: 4, label: '2024/25' },
        { id: 5, label: '2025/26' },
      ],
    };
    http.expectOne('/api/lots/1/footprint/').flush(two);
    await fixture.whenStable();
    buttonNamed('Usar precio sugerido de Rofex')!.click();
    http
      .expectOne((req) => req.url === '/api/market/suggested-price/')
      .flush({
        crop: 'SOY',
        symbol: 'SOJ.ROS/MAY26',
        price_usd_t: 300,
        kind: 'last',
        date: null,
        environment: 'LIVE',
        simulated_market: false,
        source: 'Matba Rofex',
        disclaimer: 'Precio sugerido de mercado.',
      });
    await fixture.whenStable();
    expect(text()).toContain('Estimado');
    // un precio del mercado real no se rotula como de prueba
    expect(visible('.hero')).toContain('Con el precio de Rofex');
    expect(visible('.hero')).not.toContain('prueba');

    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    select.value = '4';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    http.expectOne('/api/lots/1/footprint/?campaign=4').flush({
      ...two,
      campaign: { id: 4, label: '2024/25', crop: 'SOY', crop_origin: 'DECLARED' },
    });
    await fixture.whenStable();
    expect(text()).not.toContain('Estimado');
    expect(visible('.suggest')).toBe('Usar precio sugerido de Rofex');
  });

  it('al volver a abrir, el precio de Rofex sigue estimado y con el aviso de prueba', async () => {
    await setup(3);
    buttonNamed('Usar precio sugerido de Rofex')!.click();
    http
      .expectOne((req) => req.url === '/api/market/suggested-price/')
      .flush({
        crop: 'SOY',
        symbol: 'SOJ.ROS/MAY26',
        price_usd_t: 300,
        kind: 'settlement',
        date: '2026-11-13',
        environment: 'REMARKET',
        simulated_market: true,
        source: 'Matba Rofex',
        disclaimer: 'Precio sugerido de mercado.',
      });
    await fixture.whenStable();
    expect(text()).toContain('Estimado');

    // la misma pantalla otra vez (por ejemplo, al recargar): lo guardado vuelve con su origen
    const reopen = async () => {
      fixture.destroy();
      fixture = TestBed.createComponent(ProfitPage);
      await fixture.whenStable();
      http.expectOne('/api/lots/1/').flush(LOT);
      http.expectOne('/api/lots/1/footprint/').flush(footprint(3));
      await fixture.whenStable();
    };
    await reopen();
    expect(amounts()).toEqual(['900', '9.000']);
    expect(visible('.price .field__hint')).toContain('Estimado');
    // guardada puede ser de otro día: se ofrece actualizarla
    expect(visible('.suggest')).toBe(
      'Sugerido por Matba Rofex · 13/11/2026 Precio de prueba Actualizar',
    );
    expect(visible('.hero')).toContain('Con el precio de prueba de Rofex');

    // si no se puede actualizar, queda la que había, con su precio y su origen
    buttonNamed('Actualizar')!.click();
    http
      .expectOne((req) => req.url === '/api/market/suggested-price/')
      .flush({ detail: 'Rofex tardó demasiado en responder.' }, { status: 502, statusText: 'Bad' });
    await fixture.whenStable();
    expect(visible('.suggest')).toBe(
      'Sugerido por Matba Rofex · 13/11/2026 Precio de prueba Reintentar',
    );
    expect(text()).toContain('No se pudo actualizar: Rofex tardó demasiado en responder.');
    expect(amounts()).toEqual(['900', '9.000']);
    expect(visible('.price .field__hint')).toContain('Estimado');

    // actualizada: el precio nuevo pasa al campo y ya no hace falta actualizar
    buttonNamed('Reintentar')!.click();
    http
      .expectOne((req) => req.url === '/api/market/suggested-price/')
      .flush({
        crop: 'SOY',
        symbol: 'SOJ.ROS/MAY26',
        price_usd_t: 320,
        kind: 'last',
        date: '2026-11-14',
        environment: 'LIVE',
        simulated_market: false,
        source: 'Matba Rofex',
        disclaimer: 'Precio sugerido de mercado.',
      });
    await fixture.whenStable();
    expect(visible('.suggest')).toBe('Sugerido por Matba Rofex · 14/11/2026');
    expect(amounts()).toEqual(['960', '9.600']);
    expect(visible('.hero')).toContain('Con el precio de Rofex');

    // un precio propio sigue declarado, con el sugerido a mano
    page().setPrice('310');
    await reopen();
    expect(text()).not.toContain('Estimado');
    expect(visible('.suggest')).toBe('Rofex: US$ 320/t · 14/11/2026 Usar Actualizar');
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
    expect(text()).toContain('Lo cargaste vos · huella: 3 t/ha');
    page().setYield('');
    await fixture.whenStable();
    expect(amounts()).toEqual(['300', '3.000']);
    expect(text()).toContain('De tu declaración en la huella');
  });

  it('sin campañas igual calcula con el rinde que se carga a mano', async () => {
    await setup(null, false);
    expect(text()).toContain('Sin campañas todavía: cargalo vos');
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

  it('como página muestra las pestañas del lote y su encabezado', async () => {
    await setup(3);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-lot-tabs')).not.toBeNull();
    expect(el.querySelector('app-page-header h1')?.textContent).toContain('Rentabilidad');
  });

  it('embebida en el popup toma el id del input y no repite las pestañas ni el encabezado', async () => {
    await start({ id: 1, embedded: true });
    http.expectOne('/api/lots/1/').flush(LOT);
    http.expectOne('/api/lots/1/footprint/').flush(footprint(3));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.classList).toContain('is-embedded');
    expect(el.querySelector('app-lot-tabs')).toBeNull();
    expect(el.querySelector('app-page-header')).toBeNull();
    expect(el.querySelector('.hero app-kpi-card')).not.toBeNull();
    expect(text()).toContain('Tus números');
  });
});
