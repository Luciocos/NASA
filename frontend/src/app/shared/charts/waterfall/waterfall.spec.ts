import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WaterfallStep } from '../types';
import { WaterfallChart, waterfallSpans } from './waterfall';

const STEPS: WaterfallStep[] = [
  { label: 'Ingreso bruto', value: 1150, kind: 'total' },
  { label: 'Fertilizantes', value: -180, kind: 'delta' },
  { label: 'Labores', value: -95, kind: 'delta' },
  { label: 'Bonificación', value: 40, kind: 'delta' },
  { label: 'Margen', value: 915, kind: 'total' },
];

describe('WaterfallChart', () => {
  let fixture: ComponentFixture<WaterfallChart>;
  const el = () => fixture.nativeElement as HTMLElement;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WaterfallChart] }).compileComponents();
    fixture = TestBed.createComponent(WaterfallChart);
  });

  it('acumula las variaciones desde el total anterior', () => {
    expect(waterfallSpans(STEPS)).toEqual([
      { from: 0, to: 1150 },
      { from: 1150, to: 970 },
      { from: 970, to: 875 },
      { from: 875, to: 915 },
      { from: 0, to: 915 },
    ]);
  });

  it('dibuja color más signo por variación, conectores y el último total destacado', async () => {
    await render({ steps: STEPS, unit: 'USD/ha' });

    const steps = [...el().querySelectorAll('path.step')];
    expect(steps.length).toBe(5);
    expect(steps[1].classList.contains('tone-negative')).toBe(true);
    expect(steps[1].classList.contains('grow--back')).toBe(true);
    expect(steps[3].classList.contains('tone-positive')).toBe(true);
    expect(steps[4].classList.contains('step--final')).toBe(true);
    expect(steps[0].classList.contains('step--final')).toBe(false);
    const text = el().querySelector('svg.plot')?.textContent ?? '';
    expect(text).toContain('-180 USD/ha');
    expect(text).toContain('+40 USD/ha');
    expect(text).toContain('1.150 USD/ha');
    expect(el().querySelectorAll('line.link').length).toBe(4);
    // el valor va del lado de afuera de la barra: a la derecha si crece, a la izquierda si baja
    const anchors = [...el().querySelectorAll('svg.plot text.t-num.t-strong')].map((t) =>
      t.getAttribute('text-anchor'),
    );
    expect(anchors).toEqual(['start', 'end', 'end', 'start', 'start']);
  });

  it('resume la cascada y ofrece la tabla con el acumulado', async () => {
    await render({ steps: STEPS, unit: 'USD/ha' });

    const label = el().querySelector('svg.plot')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Cascada de 5 pasos');
    expect(label).toContain('Labores: -95 USD/ha');
    const rows = [...el().querySelectorAll('details tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows[2]).toEqual(['Labores', 'Variación', '-95', '875']);
    expect(rows[4]).toEqual(['Margen', 'Total', '915', '915']);
  });

  it('muestra el estado vacío', async () => {
    await render({ steps: [] });
    expect(el().querySelector('svg.plot')).toBeNull();
    expect(el().textContent).toContain('Sin datos para mostrar');
  });
});
