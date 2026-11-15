import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataBar } from './data-bar';

describe('DataBar', () => {
  let fixture: ComponentFixture<DataBar>;
  const el = () => fixture.nativeElement as HTMLElement;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DataBar] }).compileComponents();
    fixture = TestBed.createComponent(DataBar);
  });

  it('dibuja el valor contra su máximo, con rótulo y aria-label', async () => {
    await render({ label: 'NDVI medio', value: 0.62, max: 1, decimals: 2, tone: 'verified' });

    expect(el().querySelector('path.fill')).not.toBeNull();
    expect(el().querySelector('svg.plot')?.textContent).toContain('NDVI medio');
    expect(el().querySelector('svg.plot')?.getAttribute('aria-label')).toBe(
      'NDVI medio: 0,62 out of a maximum of 1,00 (62 %).',
    );
    const cells = [...el().querySelectorAll('details tbody td')].map((td) => td.textContent);
    expect(cells).toEqual(['0,62', '1,00', '62 %']);
  });

  it('null muestra "Sin dato" con el motivo y la pista con trama', async () => {
    await render({ label: 'Humedad del suelo', value: null, reason: 'sin pasada de SMAP' });

    expect(el().querySelector('path.fill')).toBeNull();
    expect(el().querySelector('rect.track--missing')).not.toBeNull();
    expect(el().querySelector('svg.plot')?.textContent).toContain('No data · sin pasada de SMAP');
  });

  it('la tabla se puede apagar en listas densas', async () => {
    await render({ value: 3, max: 5, showTable: false });
    expect(el().querySelector('details')).toBeNull();
  });
});
