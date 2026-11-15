import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimelineEvent } from '../types';
import { EventTimelineChart } from './event-timeline';

const EVENTS: TimelineEvent[] = [
  {
    id: 1,
    type: 'SOWING',
    typeLabel: 'Siembra',
    date: '2026-09-07',
    uncertaintyDays: 6,
    origin: 'VERIFIED',
    sensorLabel: 'NISAR',
    simulated: false,
    campaignLabel: '2026/27',
  },
  {
    id: 2,
    type: 'COVER_CROP',
    typeLabel: 'Cultivo de cobertura',
    date: '2025-05-20',
    uncertaintyDays: 10,
    origin: 'DECLARED',
    sensorLabel: 'HLS',
    simulated: true,
  },
  {
    id: 3,
    type: 'LAND_USE_CHANGE',
    typeLabel: 'Cambio de uso',
    date: '2023-03-02',
    uncertaintyDays: null,
    origin: 'ESTIMATED',
    sensorLabel: 'Landsat',
    simulated: false,
  },
];

describe('EventTimelineChart', () => {
  let fixture: ComponentFixture<EventTimelineChart>;
  const el = () => fixture.nativeElement as HTMLElement;
  const marks = () => [...el().querySelectorAll<SVGGElement>('g.mark')];

  async function render(inputs: Record<string, unknown>): Promise<void> {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EventTimelineChart] }).compileComponents();
    fixture = TestBed.createComponent(EventTimelineChart);
  });

  it('dibuja una marca por evento en orden cronológico y una fila por tipo', async () => {
    await render({ events: EVENTS, today: '2026-11-14', title: 'Bitácora' });

    expect(marks().map((mark) => mark.getAttribute('aria-label'))).toEqual([
      'Cambio de uso, 02/03/2023, incertidumbre sin dato, Landsat, estimado',
      'Cultivo de cobertura, 20/05/2025 ± 10 días, HLS, declarado, dato simulado para la demostración',
      'Siembra, 07/09/2026 ± 6 días, NISAR, verificado, campaña 2026/27',
    ]);
    expect(el().querySelectorAll('line.lane').length).toBe(3);
    // las filas siguen el orden fijo de tipos, no el de los datos
    const lanes = [...el().querySelectorAll('text.lane__label')].map((node) =>
      node.textContent?.trim(),
    );
    expect(lanes).toEqual(['Siembra', 'Cultivo de cobertura', 'Cambio de uso']);
    expect(el().textContent).toContain('Hoy');
  });

  it('la forma depende del origen y el simulado lleva contorno discontinuo', async () => {
    await render({ events: EVENTS, today: '2026-11-14' });

    const [estimated, declared, verified] = marks();
    expect(estimated.querySelector('.mark__shape--hollow')).not.toBeNull();
    expect(verified.querySelector('.mark__shape--hollow')).toBeNull();
    // el rombo se traza con rectas y el círculo con arcos
    expect(declared.querySelector('.mark__shape')?.getAttribute('d')).not.toContain('A');
    expect(verified.querySelector('.mark__shape')?.getAttribute('d')).toContain('A');
    expect(declared.querySelector('.mark__halo')).not.toBeNull();
    expect(verified.querySelector('.mark__halo')).toBeNull();
    expect(el().querySelectorAll('g.whisker').length).toBe(2);
    const legend = el().querySelector('ul.legend')?.textContent ?? '';
    expect(legend).toContain('Verificado');
    expect(legend).toContain('Dato simulado para la demostración');
  });

  it('resume la bitácora en un role="img" con aria-label', async () => {
    await render({ events: EVENTS, today: '2026-11-14', description: 'Eventos del Lote 1' });

    const label = el().querySelector('g[role="img"]')?.getAttribute('aria-label') ?? '';
    expect(label.startsWith('Eventos del Lote 1. Línea de tiempo con 3 eventos')).toBe(true);
    expect(label).toContain('1 verificado, 1 declarado, 1 estimado');
    expect(label).toContain('1 dato simulado para la demostración');
  });

  it('se maneja con teclado: tabindex itinerante, flechas y Enter o Espacio', async () => {
    await render({ events: EVENTS, today: '2026-11-14' });
    const selected: (number | string)[] = [];
    fixture.componentInstance.eventSelect.subscribe((id) => selected.push(id));

    // una sola marca entra en el orden de tabulación: la más reciente
    expect(marks().map((mark) => mark.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);

    marks()[2].focus();
    marks()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await fixture.whenStable();
    expect(document.activeElement).toBe(marks()[1]);
    expect(el().querySelector('.tip')?.textContent).toContain('Cultivo de cobertura');

    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    marks()[1].dispatchEvent(space);
    marks()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    marks()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(space.defaultPrevented).toBe(true);
    expect(selected).toEqual([2, 2, 3]);
  });

  it('resalta la seleccionada con aria-pressed', async () => {
    await render({ events: EVENTS, today: '2026-11-14', selectedId: 2 });

    expect(marks().map((mark) => mark.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(marks()[1].classList.contains('mark--selected')).toBe(true);
    expect(marks()[1].getAttribute('tabindex')).toBe('0');
  });

  it('muestra el globo al pasar el mouse', async () => {
    await render({ events: EVENTS, today: '2026-11-14' });

    marks()[2].dispatchEvent(new MouseEvent('pointerenter'));
    await fixture.whenStable();
    const tip = el().querySelector('.tip')?.textContent ?? '';
    expect(tip).toContain('Siembra');
    expect(tip).toContain('07/09/2026 ± 6 días');
    expect(tip).toContain('Sensor: NISAR');
    marks()[2].dispatchEvent(new MouseEvent('pointerleave'));
    await fixture.whenStable();
    expect(el().querySelector('.tip')).toBeNull();
  });

  it('ofrece la tabla equivalente, con "Sin dato" donde falta', async () => {
    await render({ events: EVENTS, today: '2026-11-14' });

    const headers = [...el().querySelectorAll('details thead th')].map((th) => th.textContent);
    expect(headers).toEqual([
      'Evento',
      'Fecha',
      'Incertidumbre',
      'Sensor',
      'Origen',
      'Campaña',
      'Dato simulado',
    ]);
    const first = [...(el().querySelector('details tbody tr')?.children ?? [])].map(
      (cell) => cell.textContent,
    );
    expect(first).toEqual([
      'Cambio de uso',
      '02/03/2023',
      'Sin dato',
      'Landsat',
      'Estimado',
      'Sin dato',
      'No',
    ]);
  });

  it('sin eventos muestra el estado vacío', async () => {
    await render({ events: [] });
    expect(el().querySelector('svg.plot')).toBeNull();
    expect(el().textContent).toContain('Sin eventos para mostrar');
  });
});
