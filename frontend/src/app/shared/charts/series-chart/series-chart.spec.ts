import { ComponentFixture, TestBed } from '@angular/core/testing';

import { addDays } from '../scale';
import { ChartSeries, SeriesPoint } from '../types';
import { SeriesChart, nearestIndex } from './series-chart';

// cinco pasadas con una nube en el medio: el hueco no se rellena
const SHORT: ChartSeries[] = [
  {
    name: 'NDVI',
    points: [
      { date: '2026-01-01', value: 0.31 },
      { date: '2026-01-17', value: 0.42 },
      { date: '2026-02-02', value: null, label: 'nubes' },
      { date: '2026-02-18', value: 0.66 },
      { date: '2026-03-06', value: 0.71 },
    ],
  },
];

function longSeries(count: number): SeriesPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    date: addDays('2020-01-01', index * 16),
    value: index % 7 === 3 ? null : Math.round((0.5 + 0.3 * Math.sin(index / 3)) * 100) / 100,
  }));
}

describe('SeriesChart', () => {
  let fixture: ComponentFixture<SeriesChart>;
  const el = () => fixture.nativeElement as HTMLElement;
  const svg = () => el().querySelector<SVGSVGElement>('svg.plot') as SVGSVGElement;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  async function key(name: string): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    svg().dispatchEvent(event);
    await fixture.whenStable();
    return event;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SeriesChart] }).compileComponents();
    fixture = TestBed.createComponent(SeriesChart);
  });

  it('un null corta la línea en dos tramos y deja la marca del faltante en el eje', async () => {
    await render({ series: SHORT, yDomain: [0, 1], yLabel: 'NDVI' });

    const paths = [...el().querySelectorAll('path.line')].map((path) => path.getAttribute('d'));
    expect(paths.length).toBe(2);
    // cada tramo tiene exactamente sus dos puntos: no hay un tercero inventado en el hueco
    expect(paths.every((d) => (d?.match(/[ML]/g) ?? []).length === 2)).toBe(true);
    expect(el().querySelectorAll('svg.plot rect.gap').length).toBe(1);
    expect(el().querySelector('ul.legend')?.textContent).toContain('No data');
    expect(svg().getAttribute('role')).toBe('img');
  });

  it('con pocas fechas rotula cada valor; con más de 16 usa el cursor', async () => {
    await render({ series: SHORT, decimals: 2 });
    const labels = [...el().querySelectorAll('svg.plot text.t-strong')].map((t) =>
      t.textContent?.trim(),
    );
    expect(labels).toEqual(['0.31', '0.42', '0.66', '0.71']);

    await render({ series: [{ name: 'NDVI', points: longSeries(140) }] });
    expect(el().querySelectorAll('svg.plot text.t-strong').length).toBe(0);
    expect(el().querySelectorAll('path.line').length).toBeGreaterThan(10);
  });

  it('se recorre con las flechas y anuncia fecha y valor', async () => {
    await render({ series: SHORT, decimals: 2 });

    svg().dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    expect(el().querySelector('.tip')?.textContent).toContain('06/03/2026');

    const left = await key('ArrowLeft');
    expect(left.defaultPrevented).toBe(true);
    await key('ArrowLeft');
    const live = el().querySelector('[aria-live="polite"]')?.textContent ?? '';
    expect(live).toContain('02/02/2026');
    expect(live).toContain('No data (nubes)');
    expect(el().querySelectorAll('.cursor circle').length).toBe(0);

    await key('Home');
    expect(el().querySelector('.tip')?.textContent).toContain('01/01/2026');
    expect(el().querySelectorAll('.cursor circle').length).toBe(1);

    await key('Escape');
    expect(el().querySelector('.tip')).toBeNull();
  });

  it('el cursor sigue al mouse hasta la fecha más cercana', async () => {
    await render({ series: SHORT });
    const lastX = Number(
      el().querySelectorAll('path.line')[1].getAttribute('d')?.split('L')[1]?.split(',')[0],
    );

    svg().dispatchEvent(new MouseEvent('pointermove', { clientX: lastX - 3 }));
    await fixture.whenStable();
    expect(el().querySelector('.tip')?.textContent).toContain('06/03/2026');
    svg().dispatchEvent(new MouseEvent('pointerleave'));
    await fixture.whenStable();
    expect(el().querySelector('.tip')).toBeNull();
    expect(nearestIndex([0, 10, 20], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20], 16)).toBe(2);
  });

  it('dibuja marcas verticales rotuladas y la franja de referencia', async () => {
    await render({
      series: SHORT,
      markers: [{ date: '2026-02-10', label: 'Siembra' }],
      band: { from: 0.6, to: 0.8, label: 'Cultivo sano' },
    });

    expect(el().querySelectorAll('line.marker').length).toBe(1);
    expect(el().querySelector('svg.plot')?.textContent).toContain('Siembra');
    expect(el().querySelector('rect.band')).not.toBeNull();
    const label = svg().getAttribute('aria-label') ?? '';
    expect(label).toContain('Reference band Cultivo sano');
    expect(label).toContain('Siembra on 10/02/2026');
    expect(label).toContain('1 date with no data');
  });

  it('con un solo punto dibuja el punto', async () => {
    await render({ series: [{ name: 'NDVI', points: [{ date: '2026-05-01', value: 0.5 }] }] });

    expect(el().querySelectorAll('path.line').length).toBe(0);
    expect(el().querySelector('circle.dot')?.getAttribute('r')).toBe('4');
  });

  it('dos series se distinguen por el trazo además del color y llevan leyenda', async () => {
    await render({
      series: [
        { name: 'Máxima', points: SHORT[0].points },
        {
          name: 'Mínima',
          points: SHORT[0].points.map((p) => ({ ...p, value: p.value && p.value / 2 })),
        },
      ],
      unit: '°C',
    });

    const dashes = [...el().querySelectorAll('g.series')].map(
      (g) => g.querySelector('path.line')?.getAttribute('stroke-dasharray') ?? null,
    );
    expect(dashes).toEqual([null, '6 3']);
    expect(el().querySelector('ul.legend')?.textContent).toContain('Mínima');
  });

  it('ofrece la tabla de datos, con "Sin dato" en el faltante', async () => {
    await render({ series: SHORT, markers: [{ date: '2026-02-10', label: 'Siembra' }] });

    const headers = [...el().querySelectorAll('details thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Date', 'NDVI', 'Marker']);
    const rows = [...el().querySelectorAll('details tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows[2]).toEqual(['02/02/2026', 'No data (nubes)', '']);
    expect(rows[3]).toEqual(['10/02/2026', '—', 'Siembra']);
  });

  it('sin puntos muestra el estado vacío', async () => {
    await render({ series: [{ name: 'NDVI', points: [] }], emptyText: 'Sin imágenes del lote' });
    expect(el().querySelector('svg.plot')).toBeNull();
    expect(el().textContent).toContain('Sin imágenes del lote');
  });
});
