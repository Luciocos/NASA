import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StackedSegment } from '../types';
import { StackedBar } from './stacked-bar';

const ORIGINS: StackedSegment[] = [
  { key: 'v', label: 'Verificado', value: 6, tone: 'verified' },
  { key: 'd', label: 'Declarado', value: 3, tone: 'declared' },
  { key: 'e', label: 'Estimado', value: 0, tone: 'estimated' },
];

describe('StackedBar', () => {
  let fixture: ComponentFixture<StackedBar>;
  const el = () => fixture.nativeElement as HTMLElement;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StackedBar] }).compileComponents();
    fixture = TestBed.createComponent(StackedBar);
  });

  it('dibuja los tramos con valor, con trama por origen, y el cero solo en la leyenda', async () => {
    await render({ segments: ORIGINS, unit: 'datos' });

    const segments = [...el().querySelectorAll<SVGPathElement>('svg.plot path.seg')];
    expect(segments.length).toBe(2);
    expect(segments[0].style.fill).toBe('');
    expect(segments[1].style.fill).toMatch(/declared/);
    const legend = [...el().querySelectorAll('ul.legend li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(legend).toEqual([
      'Verificado 6 datos · 67 %',
      'Declarado 3 datos · 33 %',
      'Estimado 0 datos · 0 %',
    ]);
  });

  it('resume el reparto en el aria-label y ofrece la tabla', async () => {
    await render({ segments: ORIGINS, unit: 'datos' });

    const label = el().querySelector('svg.plot')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Stacked bar of 3 parts adding up to 9 datos');
    expect(label).toContain('Declarado: 3 datos (33 %)');
    const headers = [...el().querySelectorAll('details thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Part', 'Value (datos)', 'Share']);
  });

  it('con todo en cero muestra la pista con trama y "Sin dato"', async () => {
    await render({ segments: ORIGINS.map((segment) => ({ ...segment, value: 0 })) });

    expect(el().querySelectorAll('svg.plot path.seg').length).toBe(0);
    expect(el().querySelector('svg.plot rect.missing')).not.toBeNull();
    expect(el().querySelector('svg.plot')?.textContent).toContain('No data');
  });

  it('muestra el estado vacío', async () => {
    await render({ segments: [] });
    expect(el().querySelector('svg.plot')).toBeNull();
    expect(el().textContent).toContain('No data to show');
  });
});
