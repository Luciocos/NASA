import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { LotDetail } from '../../../core/models';
import { DeclarationForm } from '../declaration-form/declaration-form';
import { makeComponent, makeFootprint, makeLot } from '../testing';
import { FootprintPage } from './footprint-page';

describe('FootprintPage', () => {
  let fixture: ComponentFixture<FootprintPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const tabs = () => [...el().querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const tab = (label: string) => tabs().find((t) => t.textContent?.trim() === label)!;
  const panel = (id: string) => el().querySelector<HTMLElement>(`#huella-panel-${id}`)!;
  const button = (label: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(label),
    );

  async function setup(
    query: Record<string, string> = {},
    inputs: Record<string, unknown> = {},
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [FootprintPage],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ lotId: '1' })),
            queryParamMap: of(convertToParamMap(query)),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FootprintPage);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  }

  async function flush(
    lot: Partial<LotDetail> = {},
    footprint = makeFootprint(),
    id = 1,
  ): Promise<void> {
    http.expectOne(`/api/lots/${id}/`).flush(makeLot({ id, ...lot }));
    http.expectOne(`/api/lots/${id}/footprint/`).flush({ ...footprint, lot: id });
    await fixture.whenStable();
  }

  const practicesLink = () =>
    [...el().querySelectorAll('a')].find((a) =>
      a.textContent?.includes('Ver puntaje y buenas prácticas'),
    )!;

  afterEach(() => {
    // el puntaje vive en la pestaña Prácticas: la huella ya no lo pide
    http.expectNone((r) => r.url.endsWith('/score/'));
    http.verify();
  });

  it('dice que todavía no se puede calcular, qué falta y quién lo completa', async () => {
    await setup();
    await flush();
    expect(text()).toContain('Lote de prueba');
    expect(el().querySelector('app-lot-tabs')).not.toBeNull();
    expect(text()).toContain('Huella estimada');
    expect(text()).toContain('Todavía no se puede calcular');
    // a la vista: los chips de lo que falta y el aviso de provisional
    expect(text()).toContain('Provisional · prueba de concepto');
    // el detalle, en las ayudas (i): están en el DOM aunque cerradas
    expect(text()).toContain('Qué falta para calcularla');
    expect(text()).toContain('Faltan 1 de 1 componentes y falta el rendimiento.');
    expect(text()).toContain('Rinde de la campaña 2025/26');
    expect(text()).toContain('Insumos gasoil');
    expect(text()).toContain('Factor de emisión con fuente gasoil');
    expect(text()).toContain('Nivel de confianza: Bajo');
    expect(text()).toContain('Estimación con respaldo satelital. Prueba de concepto.');
    expect(text()).toContain('Los valores son provisionales.');
    expect(text()).toContain('Dato simulado para la demostración');
    // el desglose está en el DOM aunque su vista esté oculta, con el motivo de cada componente
    expect(text()).toContain('Gasoil de labores');
    expect(text()).toContain('Falta el factor de emisión');
    expect(text()).toContain('Estimado');
    expect(text()).toContain('Simulación: no modifica los datos del lote.');
    expect(text().toLowerCase()).not.toContain('certific');
  });

  it('el puntaje sale de la huella: queda un enlace a Prácticas', async () => {
    await setup();
    await flush();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    expect(text()).not.toContain('Puntaje de sustentabilidad');
    expect(practicesLink().getAttribute('href')).toBe('/lotes/1/practicas');
    // como página (nadie escucha openTab) navega a la pestaña Prácticas
    practicesLink().click();
    expect(navigate).toHaveBeenCalledWith('/lotes/1/practicas');
  });

  it('en el popup pide la pestaña Prácticas con openTab y no navega', async () => {
    await setup();
    const asked: string[] = [];
    fixture.componentInstance.openTab.subscribe((tab) => asked.push(tab));
    await flush();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    practicesLink().click();
    expect(asked).toEqual(['practices']);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('embebida en el popup: toma el lote del input y cambia de vista sin sumar historial', async () => {
    await setup({ vista: 'simulador' }, { lotId: 7, embedded: true });
    await flush({}, makeFootprint(), 7);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    // la marca que el popup deja en el historial sigue en la entrada reemplazada
    vi.spyOn(TestBed.inject(Location), 'getState').mockReturnValue({
      navigationId: 4,
      lotDialog: true,
    });
    expect(el().querySelector('app-lot-tabs')).toBeNull();
    // el popup titula el lote con un h2: adentro, los títulos bajan a h3
    expect(el().querySelector('app-footprint-summary h3')?.textContent).toContain(
      'Huella estimada',
    );
    expect(el().querySelector('h2')).toBeNull();
    // ?vista= es la vista interna de la huella también en el popup
    expect(tab('Simulador').getAttribute('aria-selected')).toBe('true');
    tab('Desglose').click();
    await fixture.whenStable();
    expect(panel('desglose').hidden).toBe(false);
    expect(navigate).toHaveBeenLastCalledWith([], {
      queryParams: { vista: 'desglose' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      scroll: 'manual',
      state: { lotDialog: true },
    });
    expect(practicesLink().getAttribute('href')).toBe('/lotes/7/practicas');
  });

  it('en el popup usa la ficha que ya tiene el popup y le avisa cuando se declara', async () => {
    await setup({ vista: 'datos' }, { lotId: 7, embedded: true, lotDetail: makeLot({ id: 7 }) });
    // la ficha no se vuelve a pedir: solo la huella
    http.expectNone('/api/lots/7/');
    http.expectOne('/api/lots/7/footprint/').flush({ ...makeFootprint(), lot: 7 });
    await fixture.whenStable();
    const declared: unknown[] = [];
    fixture.componentInstance.declared.subscribe((footprint) => declared.push(footprint));

    const recalculated = { ...makeFootprint(), lot: 7 };
    const form = fixture.debugElement.query(By.directive(DeclarationForm))
      .componentInstance as DeclarationForm;
    form.declared.emit(recalculated);
    await fixture.whenStable();
    expect(declared).toEqual([recalculated]);
    // la huella queda en la campaña declarada
    for (const request of http.match((r) => r.url === '/api/lots/7/footprint/')) {
      request.flush(recalculated);
    }
  });

  it('acepta el id como texto, como lo pasa el router al enlazar parámetros', async () => {
    await setup({}, { lotId: '12' });
    await flush({}, makeFootprint(), 12);
    expect(text()).toContain('Todavía no se puede calcular');
  });

  it('muestra el valor por tonelada cuando el backend lo calcula', async () => {
    await setup();
    await flush(
      {},
      makeFootprint({
        complete: true,
        total_kg_co2e_per_t: 37.5,
        message: null,
        yield: { value: 3.2, unit: 't/ha', origin: 'DECLARED', status: 'calculado', reason: null },
        components: [makeComponent()],
      }),
    );
    expect(text()).toContain('37,5 kg CO2e/t');
    expect(text()).not.toContain('Qué falta para calcularla');
  });

  it('pide la huella de la campaña elegida', async () => {
    await setup();
    await flush();
    const select = el().querySelector('app-footprint-summary select') as HTMLSelectElement;
    select.value = '9';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const request = http.expectOne((r) => r.url === '/api/lots/1/footprint/');
    expect(request.request.params.get('campaign')).toBe('9');
    request.flush(makeFootprint());
  });

  it('una vista por vez: las pestañas cambian el panel y lo dejan en el enlace', async () => {
    await setup();
    await flush();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');

    expect(tabs().map((t) => t.textContent?.trim())).toEqual([
      'Resumen',
      'Desglose',
      'Simulador',
      'Tus datos',
    ]);
    expect(tab('Resumen').getAttribute('aria-selected')).toBe('true');
    expect(panel('resumen').hidden).toBe(false);
    expect(panel('desglose').hidden).toBe(true);

    tab('Desglose').click();
    await fixture.whenStable();
    expect(tab('Desglose').getAttribute('aria-selected')).toBe('true');
    expect(tab('Desglose').tabIndex).toBe(0);
    expect(tab('Resumen').tabIndex).toBe(-1);
    expect(panel('desglose').hidden).toBe(false);
    expect(panel('resumen').hidden).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith([], {
      queryParams: { vista: 'desglose' },
      queryParamsHandling: 'merge',
      replaceUrl: false,
      scroll: 'manual',
    });

    // con las flechas avanza, da la vuelta y lleva el foco a la pestaña elegida
    tab('Desglose').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    await fixture.whenStable();
    expect(tab('Simulador').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Simulador'));
    expect(navigate).toHaveBeenLastCalledWith([], {
      queryParams: { vista: 'simulador' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      scroll: 'manual',
    });
    tab('Simulador').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await fixture.whenStable();
    expect(tab('Tus datos').getAttribute('aria-selected')).toBe('true');
    tab('Tus datos').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    await fixture.whenStable();
    expect(tab('Resumen').getAttribute('aria-selected')).toBe('true');
  });

  it('abre la vista del enlace (?vista=simulador)', async () => {
    await setup({ vista: 'simulador' });
    await flush();
    expect(tab('Simulador').getAttribute('aria-selected')).toBe('true');
    expect(panel('simulador').hidden).toBe(false);
  });

  it('la acción principal abre Tus datos con el formulario', async () => {
    await setup();
    await flush();
    button('Cargar rinde e insumos')!.click();
    await fixture.whenStable();
    expect(tab('Tus datos').getAttribute('aria-selected')).toBe('true');
    expect(panel('datos').hidden).toBe(false);
    expect(panel('datos').querySelector('app-declaration-form')).not.toBeNull();
    // ya está en el formulario: la acción no se repite
    expect(button('Cargar rinde e insumos')).toBeUndefined();
  });

  it('con el rinde ya cargado no repite la vista "Tus datos" con un botón en el resumen', async () => {
    await setup();
    const footprint = makeFootprint();
    await flush(
      {},
      { ...footprint, yield: { ...footprint.yield, value: 3.2, origin: 'DECLARED' } },
    );
    expect(button('Cargar rinde e insumos')).toBeUndefined();
    expect(button('Ver tus datos')).toBeUndefined();
    // en el resumen solo quedan las ayudas (i): ninguna acción
    expect(el().querySelector('app-footprint-summary button.btn')).toBeNull();
    // lo declarado se revisa en su vista, a un toque
    tab('Tus datos').click();
    await fixture.whenStable();
    expect(tab('Tus datos').getAttribute('aria-selected')).toBe('true');
  });

  it('en un ejemplo no se cargan datos: ni la acción ni la vista Tus datos', async () => {
    await setup({ vista: 'datos' });
    await flush({ is_example: true, owned: false });
    expect(button('Cargar rinde e insumos')).toBeUndefined();
    expect(el().querySelector('app-declaration-form')).toBeNull();
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['Resumen', 'Desglose', 'Simulador']);
    // quien mira un ejemplo no carga nada: lo carga el productor
    expect(text()).toContain('Insumos gasoil: los carga el productor.');
    // ?vista=datos no existe en un ejemplo: vuelve al resumen
    expect(tab('Resumen').getAttribute('aria-selected')).toBe('true');
  });

  it('un lote ajeno o inexistente invita a ingresar', async () => {
    await setup();
    http.expectOne('/api/lots/1/').flush('', { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/lots/1/footprint/').flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(el().querySelector('app-login-invite')).not.toBeNull();
    expect(el().querySelector('app-lot-tabs')).toBeNull();
  });

  it('si el servidor falla lo dice en lenguaje llano y deja probar de nuevo', async () => {
    await setup();
    http.expectOne('/api/lots/1/').flush('', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/lots/1/footprint/').flush('', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(text()).toContain('No pudimos mostrar este lote en este momento.');
    expect(text().toLowerCase()).not.toContain('backend');

    button('Reintentar')!.click();
    await fixture.whenStable();
    await flush();
    expect(text()).toContain('Todavía no se puede calcular');
  });
});
