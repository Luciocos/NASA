import { ComponentFixture, TestBed } from '@angular/core/testing';

import { makeComponent, makeFootprint } from '../testing';
import { FootprintOverview } from './footprint-overview';

describe('FootprintOverview', () => {
  let fixture: ComponentFixture<FootprintOverview>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FootprintOverview] }).compileComponents();
    fixture = TestBed.createComponent(FootprintOverview);
  });

  it('tres tarjetas deslizables con nombre y posición', async () => {
    fixture.componentRef.setInput('footprint', makeFootprint());
    await fixture.whenStable();
    const region = el().querySelector('app-card-slides')!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBe('Footprint summary');
    const slides = [...el().querySelectorAll('.slide')];
    expect(slides.map((s) => s.getAttribute('aria-label'))).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    expect(slides.every((s) => s.getAttribute('aria-roledescription') === 'slide')).toBe(true);
  });

  it('lo que más pesa, ordenado, con su parte del total y su origen', async () => {
    fixture.componentRef.setInput(
      'footprint',
      makeFootprint({
        total_kg_co2e_per_t: 10,
        yield: { value: 3.2, unit: 't/ha', origin: 'DECLARED', status: 'calculado', reason: null },
        components: [
          makeComponent({ key: 'seed', kg_co2e_per_t: 2.5 }),
          makeComponent({
            key: 'diesel',
            label: 'Gasoil de labores',
            kg_co2e_per_t: 7.5,
            activity: { quantity: 20, unit: 'l/ha', origin: 'DECLARED', origins: [], records: 1 },
          }),
        ],
      }),
    );
    await fixture.whenStable();
    const part = (li: Element, selector: string) =>
      li.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
    // la unidad se lee (oculta a la vista: está en el subtítulo) y la parte del total al costado
    const items = [...el().querySelectorAll('.weight')].map((li) => [
      part(li, '.weight__name'),
      part(li, '.weight__value'),
      part(li, '.weight__origin'),
    ]);
    expect(items).toEqual([
      ['Diesel', '7.5 kg CO2e/t · 75 %', 'Declared'],
      ['Seed', '2.5 kg CO2e/t · 25 %', 'Estimated'],
    ]);
    expect(el().querySelector('.weight__value .visually-hidden')?.textContent?.trim()).toBe(
      'kg CO2e/t',
    );
    // con todo calculado, el enlace lleva a ver todos en Desglose
    expect(el().querySelector('.more-btn')?.textContent).toContain('See all 2 in Breakdown');
    expect(el().textContent).toContain('3.2');
    expect(el().textContent).toContain('t/ha');
  });

  it('muestra los cuatro que más pesan; el resto queda en Desglose', async () => {
    const keys = [
      'seed',
      'diesel',
      'pesticides',
      'soil_n2o',
      'fertilizer_n_production',
      'fertilizer_p_production',
    ];
    fixture.componentRef.setInput(
      'footprint',
      makeFootprint({
        yield: { value: 3.2, unit: 't/ha', origin: 'DECLARED', status: 'calculado', reason: null },
        components: keys.map((key, i) => makeComponent({ key, kg_co2e_per_t: i + 1 })),
      }),
    );
    await fixture.whenStable();
    const names = [...el().querySelectorAll('.weight__name')].map((n) => n.textContent?.trim());
    expect(names).toEqual([
      'Phosphate fertilizer',
      'Nitrogen fertilizer',
      'Soil N2O',
      'Pesticides',
    ]);
    expect(el().querySelector('.more-btn')?.textContent).toContain('See all 6 in Breakdown');
  });

  it('sin nada calculado lo dice; sin rinde muestra el motivo', async () => {
    fixture.componentRef.setInput('footprint', makeFootprint());
    await fixture.whenStable();
    const text = el().textContent ?? '';
    expect(text).toContain('No component has been calculated yet.');
    expect(text).toContain('No data');
    expect(text).toContain('Falta el rendimiento de la campaña 2025/26.');
    expect(text).toContain('references with a source');
    // qué significa cada origen y cómo se mide la confianza van en la ayuda (i) de la tarjeta
    const help = el().querySelector('app-info-tip')!;
    expect(help.querySelector('button')?.getAttribute('aria-label')).toBe('What each origin means');
    expect(help.textContent).toContain(
      'It is not data from this field or a satellite observation.',
    );
    expect(help.textContent).toContain('Confidence level: Low.');
  });

  it('"ver Desglose" pide a la página cambiar de vista', async () => {
    let asked = 0;
    fixture.componentInstance.showBreakdown.subscribe(() => asked++);
    fixture.componentRef.setInput('footprint', makeFootprint());
    await fixture.whenStable();
    const more = el().querySelector<HTMLButtonElement>('.more-btn')!;
    expect(more.textContent).toContain('1 of 1 missing: see Breakdown');
    more.click();
    expect(asked).toBe(1);
  });

  it('el rinde de referencia muestra su fuente en la ayuda, no a la vista', async () => {
    fixture.componentRef.setInput(
      'footprint',
      makeFootprint({
        yield: {
          value: 7.85,
          unit: 't/ha',
          origin: 'ESTIMATED',
          status: 'calculado',
          reason: null,
          reference: 'Informe regional de prueba',
        },
      }),
    );
    await fixture.whenStable();
    const kpi = el().querySelector('app-kpi-card')!;
    expect(kpi.textContent).toContain('7.85');
    expect(kpi.textContent).toContain('Regional reference');
    expect(kpi.querySelector('app-info-tip')?.textContent).toContain(
      'Source: Informe regional de prueba',
    );
  });
});
