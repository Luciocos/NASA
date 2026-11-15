import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatusRingItem } from '../types';
import { StatusRing } from './status-ring';

const CRITERIA: StatusRingItem[] = [
  { label: 'Sin cambio de uso desde 2020', status: 'cumple' },
  { label: 'Siembra directa', status: 'cumple' },
  { label: 'Cobertura invernal', status: 'sin_dato' },
  { label: 'Sin quema', status: 'no_cumple' },
];

describe('StatusRing', () => {
  let fixture: ComponentFixture<StatusRing>;
  const el = () => fixture.nativeElement as HTMLElement;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StatusRing] }).compileComponents();
    fixture = TestBed.createComponent(StatusRing);
  });

  it('dibuja un tramo por criterio con trama y símbolo según el estado', async () => {
    await render({ items: CRITERIA });

    const segments = [...el().querySelectorAll<SVGPathElement>('path.seg')];
    expect(segments.length).toBe(4);
    expect(segments[0].style.fill).toBe('');
    expect(segments[2].style.fill).toMatch(/nodata/);
    expect(segments[3].style.fill).toMatch(/-no/);
    const symbols = [...el().querySelectorAll('text.sym')].map((t) => t.textContent?.trim());
    expect(symbols).toEqual(['✓', '✓', '?', '✗']);
    expect(el().querySelector('text.center')?.textContent?.trim()).toBe('2 of 4');
    const list = el().querySelector('ul.ring__list')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(list).toContain('Cobertura invernal · No data');
    expect(list).toContain('Sin quema · Not met');
  });

  it('usa el rótulo central pedido', async () => {
    await render({ items: CRITERIA, centerLabel: '72' });
    expect(el().querySelector('text.center')?.textContent?.trim()).toBe('72');
  });

  it('resume los estados en el aria-label y ofrece la tabla', async () => {
    await render({ items: CRITERIA, description: 'Puntaje provisional' });

    const label = el().querySelector('svg[role="img"]')?.getAttribute('aria-label') ?? '';
    expect(label).toContain(
      'Puntaje provisional. Ring of 4 criteria: 2 met, 1 not met and 1 with no data',
    );
    const rows = [...el().querySelectorAll('details tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows[3]).toEqual(['Sin quema', 'Not met']);
  });

  it('muestra el estado vacío', async () => {
    await render({ items: [] });
    expect(el().querySelector('svg')).toBeNull();
    expect(el().textContent).toContain('No criteria to show');
  });
});
