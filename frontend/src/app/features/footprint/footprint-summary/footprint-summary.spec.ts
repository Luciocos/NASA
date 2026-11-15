import { ComponentFixture, TestBed } from '@angular/core/testing';

import { makeComponent, makeFootprint } from '../testing';
import { missingItems } from '../format';
import { FootprintSummary } from './footprint-summary';

describe('FootprintSummary', () => {
  let fixture: ComponentFixture<FootprintSummary>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FootprintSummary] }).compileComponents();
    fixture = TestBed.createComponent(FootprintSummary);
  });

  it('sin total: lo dice, lo que falta en chips y el detalle en la ayuda', async () => {
    fixture.componentRef.setInput('footprint', makeFootprint());
    await fixture.whenStable();
    const text = el().textContent ?? '';
    expect(el().classList).toContain('is-missing');
    expect(el().querySelector('.value')?.textContent?.trim()).toBe('Todavía no se puede calcular');
    const chips = [...el().querySelectorAll('.chip')].map((chip) => chip.textContent?.trim());
    expect(chips).toEqual([
      'Rinde',
      'Insumos',
      'Factor de emisión',
      'Confianza baja',
      'Provisional · prueba de concepto',
    ]);
    // quién completa cada cosa, en la ayuda (i) de los chips
    const [missingHelp, aboutHelp] = [...el().querySelectorAll('app-help-tip')];
    expect(missingHelp.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Qué falta para calcularla',
    );
    expect(missingHelp.textContent).toContain('Faltan 1 de 1 componentes y falta el rendimiento.');
    expect([...missingHelp.querySelectorAll('li')].map((li) => li.textContent?.trim())).toEqual([
      'Rinde de la campaña 2025/26: lo cargás vos.',
      'Insumos gasoil: los cargás vos.',
      'Factor de emisión con fuente gasoil: lo carga el equipo.',
    ]);
    // el aviso de estimación, la confianza con su regla y el descargo, en la otra ayuda
    expect(aboutHelp.textContent).toContain('Prueba de concepto. Los valores son provisionales.');
    expect(aboutHelp.textContent).toContain('Nivel de confianza: Bajo');
    expect(aboutHelp.textContent).toContain('(0 verificados, 0 declarados, 1 estimados)');
    expect(aboutHelp.textContent).toContain('ALTO si la mayoría');
    expect(text).toContain('Dato simulado para la demostración');
    expect(text.toLowerCase()).not.toContain('certific');
  });

  it('con total: el número grande con su unidad y sin lista de faltantes', async () => {
    fixture.componentRef.setInput(
      'footprint',
      makeFootprint({
        total_kg_co2e_per_t: 37.5,
        complete: true,
        message: null,
        uses_simulated_data: false,
        yield: { value: 3.2, unit: 't/ha', origin: 'DECLARED', status: 'calculado', reason: null },
        components: [makeComponent()],
      }),
    );
    await fixture.whenStable();
    expect(el().classList).not.toContain('is-missing');
    expect(el().querySelector('.value')?.textContent?.trim()).toBe('37,5 kg CO2e/t');
    expect(el().textContent).not.toContain('Falta');
    expect(el().querySelectorAll('app-help-tip').length).toBe(1);
    expect(el().textContent).not.toContain('Dato simulado');
  });

  it('en un ejemplo, el rinde y los insumos los carga el productor', async () => {
    fixture.componentRef.setInput('footprint', makeFootprint());
    fixture.componentRef.setInput('own', false);
    await fixture.whenStable();
    const help = el().querySelector('app-help-tip')?.textContent ?? '';
    expect(help).toContain('Rinde de la campaña 2025/26: lo carga el productor.');
    expect(help).toContain('Insumos gasoil: los carga el productor.');
    expect(help).not.toContain('vos');
  });

  it('elige la campaña con el selector', async () => {
    const chosen: (number | null)[] = [];
    fixture.componentInstance.campaignChange.subscribe((id) => chosen.push(id));
    fixture.componentRef.setInput('footprint', makeFootprint());
    await fixture.whenStable();
    const select = el().querySelector('select')!;
    expect(select.closest('label')?.textContent).toContain('Campaña');
    select.value = '9';
    select.dispatchEvent(new Event('change'));
    expect(chosen).toEqual([9]);
  });

  it('con una sola campaña la nombra sin selector', async () => {
    fixture.componentRef.setInput(
      'footprint',
      makeFootprint({ available_campaigns: [{ id: 10, label: '2025/26' }] }),
    );
    await fixture.whenStable();
    expect(el().querySelector('select')).toBeNull();
    expect(el().textContent).toContain('Campaña 2025/26');
  });
});

describe('missingItems', () => {
  it('agrupa lo que falta: rinde, insumos, factores e historial satelital', () => {
    const fp = makeFootprint({
      components: [
        makeComponent({
          key: 'fertilizer_n_production',
          status: 'sin_dato',
          activity: { quantity: null, unit: null, origin: null, origins: [], records: 0 },
        }),
        makeComponent({
          key: 'soil_n2o',
          status: 'sin_dato',
          activity: { quantity: null, unit: null, origin: null, origins: [], records: 0 },
        }),
        makeComponent({
          key: 'diesel',
          status: 'sin_dato',
          activity: { quantity: null, unit: null, origin: null, origins: [], records: 0 },
          factor: { key: 'diesel', value: null, unit: null, source: null, validated: false },
        }),
        makeComponent({
          key: 'land_use_change',
          status: 'sin_dato',
          activity: {
            quantity: null,
            unit: null,
            origin: null,
            origins: [],
            records: 0,
            detected: null,
          },
          factor: { key: 'land_use_change', value: null },
        }),
        makeComponent(),
      ],
    });
    expect(missingItems(fp).map((item) => [item.kind, item.chip, item.detail])).toEqual([
      ['yield', 'Rinde', 'de la campaña 2025/26'],
      ['inputs', 'Insumos', 'nitrógeno y gasoil'],
      ['factors', 'Factor de emisión', 'gasoil'],
      ['events', 'Historial satelital', 'cambio de uso del suelo desde 2020'],
    ]);
  });

  it('con todo calculado no falta nada', () => {
    const fp = makeFootprint({
      yield: { value: 3.2, unit: 't/ha', origin: 'DECLARED', status: 'calculado', reason: null },
      components: [makeComponent()],
    });
    expect(missingItems(fp)).toEqual([]);
  });
});
