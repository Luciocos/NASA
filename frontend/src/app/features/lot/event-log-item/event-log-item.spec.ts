import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventLogItem } from '../../../core/models';
import { makeEvent } from '../testing';
import { EventLogItemCard } from './event-log-item';

describe('EventLogItemCard', () => {
  let fixture: ComponentFixture<EventLogItemCard>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';
  const text = () => squash(el().textContent);
  /** el texto de las etiquetas, una por una: entre elementos vecinos no queda espacio */
  const tags = () =>
    [...(el().querySelector('.tags')?.children ?? [])].map((tag) => squash(tag.textContent));
  const help = () => squash(el().querySelector('app-disclosure')?.textContent);
  const button = (label: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

  async function render(event: EventLogItem, editable = false): Promise<void> {
    fixture.componentRef.setInput('event', event);
    fixture.componentRef.setInput('editable', editable);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventLogItemCard],
      providers: [provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(EventLogItemCard);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('a la vista, el origen, lo simulado y cuatro datos; el significado queda en la ayuda', async () => {
    await render(makeEvent());

    expect(tags()).toEqual(['Estimado', 'Dato simulado para la demostración']);
    expect(text()).toContain('12 oct 2026 ± 12 días');
    expect(text()).toContain('Manual (sin sensor satelital)');
    expect(text()).toContain('Sin dato (no la informó el procesamiento)');
    expect(text()).toContain('2025/26');
    expect(text()).toContain('Sin imágenes: lo informó una persona');
    // lo declaró una persona: no es una detección satelital
    expect(text()).not.toContain('Prueba de concepto');
    expect(help()).toContain('Es una estimación, no una observación directa.');
    expect(el().querySelector('details')?.open).toBe(false);
  });

  it('una detección satelital marca la prueba de concepto y deja las métricas en la ayuda', async () => {
    await render(
      makeEvent({
        sensor: 'NISAR',
        origin: 'VERIFIED',
        confidence: 0.7,
        is_simulated: false,
        metrics: {
          hh_db_change: -1.78,
          threshold_validated: false,
          dates_compared: ['2026-09-01', '2026-09-13'],
        },
      }),
    );

    expect(tags()).toEqual(['Verificado', 'Prueba de concepto']);
    expect(text()).toContain('70 %');
    expect(help()).toContain('Lo observó un satélite.');
    expect(help()).toContain('la detección no está validada en campo');
    const metrics = el().querySelector('app-disclosure .metrics')?.textContent ?? '';
    expect(metrics).toContain('-1,78');
    expect(metrics).toContain('no');
    expect(metrics).toContain('2026-09-01 · 2026-09-13');
  });

  it('en un lote de solo lectura no ofrece confirmar ni corregir', async () => {
    await render(makeEvent({ evidence_image_url: '/media/evidence/a.png' }));
    expect(button('Confirmar')).toBeUndefined();
    expect(button('Corregir')).toBeUndefined();
    expect(el().querySelector('form')).toBeNull();
    expect(el().querySelector('img')?.getAttribute('src')).toBe('/media/evidence/a.png');
    expect(help()).not.toContain('declarado por vos');
  });

  it('confirma un dato estimado con PATCH, avisa el cambio de origen y deja el foco en Corregir', async () => {
    await render(makeEvent(), true);
    let reviewed: EventLogItem | undefined;
    fixture.componentInstance.reviewed.subscribe((event) => (reviewed = event));

    button('Confirmar')?.focus();
    button('Confirmar')?.click();
    const request = http.expectOne('/api/events/1/');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ confirm: true });
    request.flush(makeEvent({ origin: 'DECLARED' }));
    await fixture.whenStable();

    expect(reviewed?.origin).toBe('DECLARED');
    expect(el().querySelector('[role="status"]')?.textContent).toContain(
      'ahora figura como dato declarado',
    );
    // ya no es estimado: Confirmar se va y el foco no se pierde
    fixture.componentRef.setInput('event', reviewed);
    await fixture.whenStable();
    expect(button('Confirmar')).toBeUndefined();
    expect(document.activeElement).toBe(button('Corregir'));
    // el aviso sigue: es el mismo evento
    expect(el().querySelector('[role="status"]')?.textContent).toContain('ahora figura');
  });

  it('un dato verificado no se confirma (no cambiaría nada), solo se corrige', async () => {
    await render(makeEvent({ origin: 'VERIFIED', sensor: 'NISAR' }), true);
    expect(button('Confirmar')).toBeUndefined();
    expect(button('Corregir')).toBeDefined();
    expect(help()).toContain('declarado por vos');
  });

  it('corrige el evento: el formulario toma el foco y al guardar vuelve a Corregir', async () => {
    await render(makeEvent(), true);
    const toggle = button('Corregir');
    toggle?.click();
    await fixture.whenStable();

    const form = el().querySelector('form') as HTMLFormElement;
    expect(form).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.textContent?.trim()).toBe('Cancelar corrección');
    // mientras corrige, la acción principal es guardar: Confirmar se va
    expect(button('Confirmar')).toBeUndefined();
    expect(document.activeElement).toBe(form.querySelector('select'));

    (form.querySelector('input[type="date"]') as HTMLInputElement).value = '2026-10-20';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    const request = http.expectOne('/api/events/1/');
    expect(request.request.body).toEqual({
      type: 'TILLAGE',
      date: '2026-10-20',
      date_uncertainty_days: 12,
      notes: '',
    });
    request.flush(makeEvent({ origin: 'DECLARED', date: '2026-10-20' }));
    await fixture.whenStable();

    expect(el().querySelector('form')).toBeNull();
    expect(text()).toContain('Corrección guardada: el dato pasa a figurar como declarado.');
    expect(document.activeElement).toBe(button('Corregir'));
  });

  it('otro evento en el mismo panel empieza sin formulario ni aviso', async () => {
    await render(makeEvent(), true);
    button('Corregir')?.click();
    await fixture.whenStable();
    expect(el().querySelector('form')).not.toBeNull();

    await render(makeEvent({ id: 2, type: 'HARVEST', type_label: 'Cosecha' }), true);
    expect(el().querySelector('form')).toBeNull();
    expect(button('Corregir')?.getAttribute('aria-expanded')).toBe('false');
  });
});
