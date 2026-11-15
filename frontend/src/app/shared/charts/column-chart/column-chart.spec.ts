import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ColumnItem } from '../types';
import { ColumnChart } from './column-chart';

// lluvia mensual con un mes sin registro: el faltante no se dibuja como cero
const RAIN: ColumnItem[] = [
  { label: 'jul', value: 21 },
  { label: 'ago', value: 34 },
  { label: 'sep', value: null, note: 'sin registro de NASA POWER' },
  { label: 'oct', value: 118 },
];

describe('ColumnChart', () => {
  let fixture: ComponentFixture<ColumnChart>;
  const el = () => fixture.nativeElement as HTMLElement;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ColumnChart] }).compileComponents();
    fixture = TestBed.createComponent(ColumnChart);
  });

  it('dibuja una columna por valor y el null como columna con trama "Sin dato"', async () => {
    await render({ items: RAIN, unit: 'mm' });

    expect(el().querySelectorAll('path.col').length).toBe(3);
    const missing = el().querySelectorAll('rect.missing');
    expect(missing.length).toBe(1);
    expect((missing[0] as SVGRectElement).style.fill).toMatch(/nodata/);
    expect(el().querySelector('svg.plot')?.textContent).toContain('No data');
    const values = [...el().querySelectorAll('svg.plot text.t-strong')].map((t) =>
      t.textContent?.trim(),
    );
    expect(values).toEqual(['21', '34', '118']);
  });

  it('las columnas crecen desde el cero: hacia abajo si el valor es negativo', async () => {
    await render({
      items: [
        { label: 'jun', value: 4 },
        { label: 'jul', value: -3 },
      ],
      unit: '°C',
    });

    const [up, down] = [...el().querySelectorAll('path.col')];
    expect(up.classList.contains('grow-y--down')).toBe(false);
    expect(down.classList.contains('grow-y--down')).toBe(true);
  });

  it('destaca una columna y atenúa el resto', async () => {
    await render({ items: RAIN, unit: 'mm', highlight: 3 });

    const cols = [...el().querySelectorAll('path.col')];
    expect(cols.filter((col) => col.classList.contains('dim')).length).toBe(2);
    expect(el().querySelector('svg.plot')?.getAttribute('aria-label')).toContain(
      'Highlighted: oct, 118 mm',
    );
  });

  it('resume los valores en el aria-label y ofrece la tabla', async () => {
    await render({ items: RAIN, unit: 'mm', description: 'Lluvia mensual del lote' });

    const label = el().querySelector('svg.plot')?.getAttribute('aria-label') ?? '';
    expect(label.startsWith('Lluvia mensual del lote. Column chart with 4 values')).toBe(true);
    expect(label).toContain('sep: No data');
    expect(label).toContain('1 column with no data');
    const rows = [...el().querySelectorAll('details tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows[2]).toEqual(['sep', 'No data', 'sin registro de NASA POWER']);
  });

  it('con muchas columnas no escribe cada valor', async () => {
    const items = Array.from({ length: 36 }, (_, i) => ({ label: `m${i + 1}`, value: i * 3 }));
    await render({ items, unit: 'mm' });
    expect(el().querySelectorAll('svg.plot text.t-strong').length).toBe(0);
  });

  it('muestra el estado vacío', async () => {
    await render({ items: [] });
    expect(el().querySelector('svg.plot')).toBeNull();
    expect(el().textContent).toContain('No data to show');
  });
});
