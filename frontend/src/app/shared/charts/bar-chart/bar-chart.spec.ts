import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BarItem, BarThreshold } from '../types';
import { BarChart } from './bar-chart';

// métricas de radar de un evento real de la demo (cambio de retrodispersión en dB)
const ITEMS: BarItem[] = [
  { label: 'HH', value: -1.78, note: 'Polarización horizontal' },
  { label: 'HV', value: 0.81 },
];
const THRESHOLDS: BarThreshold[] = [{ value: 1.03, label: 'Umbral', symmetric: true }];

@Component({
  imports: [BarChart],
  template: `<app-bar-chart title="Cambio de retrodispersión" unit="dB" [items]="items" />`,
})
class StaticTitleHost {
  readonly items = ITEMS;
}

describe('BarChart', () => {
  let fixture: ComponentFixture<BarChart>;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BarChart] }).compileComponents();
    fixture = TestBed.createComponent(BarChart);
  });

  it('dibuja una barra por valor, con su etiqueta en es-AR y la unidad', async () => {
    await render({ items: ITEMS, unit: 'dB', decimals: 2, title: 'Cambio de retrodispersión' });

    expect(el().querySelectorAll('path.bar').length).toBe(2);
    expect(text()).toContain('Cambio de retrodispersión');
    expect(text()).toContain('-1,78 dB');
    expect(text()).toContain('0,81 dB');
    expect(text()).toContain('Polarización horizontal');
    const svg = el().querySelector('svg.plot');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 640 ${svg?.getAttribute('height')}`);
  });

  it('las barras negativas crecen hacia la izquierda del eje cero', async () => {
    await render({ items: ITEMS, unit: 'dB', decimals: 2 });

    const zero = Number(el().querySelector('line.axis')?.getAttribute('x1'));
    const [negative, positive] = [...el().querySelectorAll('path.bar')];
    expect(negative.classList.contains('grow--back')).toBe(true);
    expect(positive.classList.contains('grow--back')).toBe(false);
    // el trazo arranca en el cero y sigue hasta el dato: "M<cero>,<y>H<fin>..."
    const end = (bar: Element) => Number(/H(-?[\d.]+)/.exec(bar.getAttribute('d') ?? '')?.[1]);
    expect(end(negative)).toBeLessThan(zero);
    expect(end(positive)).toBeGreaterThan(zero);
  });

  it('resume el contenido en el aria-label, con la descripción adelante', async () => {
    await render({
      items: ITEMS,
      unit: 'dB',
      decimals: 2,
      thresholds: THRESHOLDS,
      description: 'Radar NISAR del evento de siembra',
    });

    const label = el().querySelector('svg.plot')?.getAttribute('aria-label') ?? '';
    expect(label.startsWith('Radar NISAR del evento de siembra. ')).toBe(true);
    expect(label).toContain('HH: -1,78 dB');
    expect(label).toContain('HV: 0,81 dB');
    expect(label).toContain('Umbral: ±1,03 dB');
  });

  it('dibuja las líneas de referencia rotuladas, también en negativo si son simétricas', async () => {
    await render({ items: ITEMS, unit: 'dB', decimals: 2, thresholds: THRESHOLDS });

    const xs = new Set(
      [...el().querySelectorAll('line.threshold')].map((line) => line.getAttribute('x1')),
    );
    expect(xs.size).toBe(2);
    const labels = [...el().querySelectorAll('svg.plot text')].filter(
      (node) => node.textContent?.trim() === 'Umbral',
    );
    expect(labels.length).toBe(2);

    await render({ thresholds: [{ value: 1.03, label: 'Umbral' }] });
    expect(
      new Set([...el().querySelectorAll('line.threshold')].map((line) => line.getAttribute('x1')))
        .size,
    ).toBe(1);
  });

  it('un valor null se dibuja como fila con trama y "Sin dato", sin barra', async () => {
    await render({
      items: [
        { label: 'HH', value: null },
        { label: 'HV', value: 0.81 },
      ],
      unit: 'dB',
      decimals: 2,
    });

    expect(el().querySelectorAll('path.bar').length).toBe(1);
    expect(el().querySelectorAll('rect.missing').length).toBe(1);
    expect(el().querySelector('svg.plot')?.textContent).toContain('No data');
    expect(el().querySelector('svg.plot')?.getAttribute('aria-label')).toContain('HH: No data');
  });

  it('con todos los valores faltantes no inventa un eje', async () => {
    await render({
      items: [
        { label: 'HH', value: null },
        { label: 'HV', value: null },
      ],
      unit: 'dB',
    });

    expect(el().querySelectorAll('rect.missing').length).toBe(2);
    expect(el().querySelectorAll('path.bar').length).toBe(0);
    expect(el().querySelectorAll('line.grid').length).toBe(0);
    expect(el().querySelector('line.axis')).toBeNull();
  });

  it('usa la trama del origen además del color', async () => {
    await render({
      items: [
        { label: 'Verificado', value: 3, tone: 'verified' },
        { label: 'Declarado', value: 2, tone: 'declared' },
        { label: 'Estimado', value: 1, tone: 'estimated' },
      ],
      unit: '',
    });

    const fills = [...el().querySelectorAll<SVGPathElement>('path.bar')].map(
      (bar) => bar.style.fill,
    );
    expect(fills[0]).toBe('');
    expect(fills[1]).toMatch(/^url\(["']?#bars-\d+-declared["']?\)$/);
    expect(fills[2]).toMatch(/^url\(["']?#bars-\d+-estimated["']?\)$/);
    const id = /#(bars-\d+-declared)/.exec(fills[1])?.[1] ?? '';
    expect(el().querySelector(`pattern[id="${id}"]`)).not.toBeNull();
  });

  it('respeta un dominio fijo', async () => {
    await render({ items: [{ label: 'NDVI', value: 0.34 }], decimals: 2, domain: [0, 1] });

    const ticks = [...el().querySelectorAll('svg.plot text.t-num')].map((node) =>
      node.textContent?.trim(),
    );
    expect(ticks).toContain('0,0');
    expect(ticks).toContain('1,0');
  });

  it('ofrece la tabla de datos equivalente dentro de "Ver datos"', async () => {
    await render({ items: ITEMS, unit: 'dB', decimals: 2, thresholds: THRESHOLDS });

    expect(el().querySelector('details summary')?.textContent?.trim()).toBe('Show data');
    const headers = [...el().querySelectorAll('details thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Category', 'Value (dB)', 'Note']);
    const rows = [...el().querySelectorAll('details tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ['HH', '-1,78', 'Polarización horizontal'],
      ['HV', '0,81', ''],
      ['Umbral (reference line)', '±1,03', ''],
    ]);
    expect(el().querySelector('details tbody th')?.getAttribute('scope')).toBe('row');
  });

  it('muestra el estado vacío, con el texto por defecto o el pedido', async () => {
    await render({ items: [] });
    expect(text()).toContain('No data to show');
    expect(el().querySelector('svg')).toBeNull();
    expect(el().querySelector('details')).toBeNull();

    await render({ emptyText: 'Este evento no tiene métricas de radar' });
    expect(text()).toContain('Este evento no tiene métricas de radar');
  });

  it('no deja el atributo title en el anfitrión: evitaría el globo nativo del navegador', async () => {
    const host = TestBed.createComponent(StaticTitleHost);
    await host.whenStable();
    const chart = (host.nativeElement as HTMLElement).querySelector('app-bar-chart');
    expect(chart?.hasAttribute('title')).toBe(false);
    expect(chart?.querySelector('figcaption')?.textContent).toBe('Cambio de retrodispersión');
  });
});
