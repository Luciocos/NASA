import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CampaignDetail, EventLogItem, EventType, LotDetail, Sensor } from '../../../core/models';
import { makeEvent } from '../testing';
import { EVENTS_SHOWN, FILTERS_FROM, LotLog } from './lot-log';

// Lote armado para la prueba: no representa un lote real.
const SOY: CampaignDetail = {
  id: 10,
  lot: 1,
  label: '2025/26',
  crop: 'SOY',
  crop_label: 'Soja',
  crop_origin: 'VERIFIED',
  yield_t_ha: 3.1,
  yield_origin: 'DECLARED',
};
const CORN: CampaignDetail = {
  id: 11,
  lot: 1,
  label: '2024/25',
  crop: 'CORN',
  crop_label: 'Maíz',
  crop_origin: 'ESTIMATED',
  yield_t_ha: null,
  yield_origin: '',
};
const LOT: LotDetail = {
  id: 1,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 24.94,
  event_count: 1,
  created_at: '2026-11-14T10:00:00Z',
  is_example: false,
  owned: true,
  campaigns: [SOY],
};

const EXAMPLE: LotDetail = { ...LOT, is_example: true, owned: false };

/** una bitácora larga, con tipos y sensores variados, para los filtros */
function manyEvents(count = FILTERS_FROM): EventLogItem[] {
  const kinds: [EventType, string, Sensor][] = [
    ['SOWING', 'Siembra', 'NISAR'],
    ['TILLAGE', 'Remoción de suelo', 'NISAR'],
    ['COVER_CROP', 'Cultivo de cobertura', 'HLS'],
    ['HARVEST', 'Cosecha', 'HLS'],
    ['SOWING', 'Siembra', 'LANDSAT'],
    ['FLOODING', 'Anegamiento', 'NISAR'],
    ['HARVEST', 'Cosecha', 'NISAR'],
  ];
  return Array.from({ length: count }, (_, index) => {
    const [type, label, sensor] = kinds[index % kinds.length];
    return makeEvent({
      id: index + 1,
      type,
      type_label: label,
      sensor,
      date: `2026-${String((index % 9) + 1).padStart(2, '0')}-${String(10 + index).padStart(2, '0')}`,
      origin: 'VERIFIED',
    });
  });
}

/** con la ventana ancha, el detalle va al costado: matchMedia responde que sí */
function wideWindow(): () => void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      matches: true,
      media,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  return () => Reflect.deleteProperty(window, 'matchMedia');
}

describe('LotLog', () => {
  let fixture: ComponentFixture<LotLog>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const squash = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';
  const text = () => squash(el().textContent);
  /** el texto como se lee: entre elementos vecinos no queda espacio en textContent */
  const words = (node: Element) => {
    const parts: string[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let item = walker.nextNode(); item; item = walker.nextNode()) {
      parts.push(item.textContent ?? '');
    }
    return squash(parts.join(' '));
  };
  const button = (label: string) =>
    [...el().querySelectorAll('button')].find((b) => squash(b.textContent) === label);
  const rows = () => [...el().querySelectorAll<HTMLButtonElement>('button.row')];
  const panel = () => el().querySelector<HTMLElement>('section.panel');
  const list = () => el().querySelector('app-section-card') as HTMLElement;
  const help = () => squash(list().querySelector('app-disclosure')?.textContent);

  async function render(
    events: EventLogItem[] = [makeEvent()],
    { lot = LOT, editable = false }: { lot?: LotDetail; editable?: boolean } = {},
  ): Promise<void> {
    fixture = TestBed.createComponent(LotLog);
    fixture.componentRef.setInput('lot', lot);
    fixture.componentRef.setInput('editable', editable);
    await fixture.whenStable();
    http.expectOne('/api/lots/1/events/').flush({
      lot: 1,
      count: events.length,
      message: events.length ? null : 'Este lote todavía no tiene eventos registrados.',
      events,
    });
    await fixture.whenStable();
  }

  async function openRow(index = 0): Promise<void> {
    rows()[index].focus();
    rows()[index].click();
    await fixture.whenStable();
  }

  async function press(key: string, shiftKey = false): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    (document.activeElement ?? el()).dispatchEvent(event);
    await fixture.whenStable();
    return event;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LotLog],
      providers: [provideRouter([]), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sin eventos lo dice en una línea y deja el detalle en la ayuda', async () => {
    await render([], { lot: { ...LOT, campaigns: [], event_count: 0 }, editable: true });

    expect(text()).toContain('Todavía no hay eventos');
    expect(squash(el().querySelector('.log-empty__line')?.textContent)).toBe(
      'Salen de observaciones satelitales procesadas.',
    );
    expect(rows().length).toBe(0);
    expect(button('Filtrar')).toBeUndefined();
    expect(el().querySelector('.campaigns')).toBeNull();
    // sin culpar a nadie: qué va a aparecer y de dónde sale, a pedido
    expect(help()).toContain('No se inventan');
    expect(help()).toContain('Acá van a aparecer la siembra, la cosecha, las labores');
    expect(help()).toContain('Podés confirmar o corregir cada evento');
    expect(list().querySelector('details')?.open).toBe(false);
  });

  it('sin eventos igual muestra las campañas del lote con su origen', async () => {
    await render([], { lot: { ...LOT, campaigns: [SOY, CORN] } });

    const campaigns = [...el().querySelectorAll('.campaign')].map(words);
    expect(campaigns).toEqual([
      '2025/26 Soja Verificado Rinde 3,1 t/ha Declarado',
      '2024/25 Maíz Estimado Rinde Sin dato (no declarado)',
    ]);
    // sin poder editar, la ayuda no ofrece revisar nada
    expect(help()).not.toContain('Podés confirmar o corregir');
  });

  it('agrupa por campaña: el encabezado dice el cultivo y el rinde, y cada evento es una fila', async () => {
    await render([makeEvent({ date: '2026-09-07', date_uncertainty_days: 6 })], {
      lot: { ...LOT, campaigns: [CORN, SOY] },
    });

    const heads = [...el().querySelectorAll('.group__head')].map(words);
    expect(heads).toEqual([
      'Campaña 2025/26 Soja Verificado Rinde 3,1 t/ha Declarado 1 evento',
      // una campaña sin eventos igual muestra lo suyo
      'Campaña 2024/25 Maíz Estimado Rinde Sin dato (no declarado) Sin eventos',
    ]);
    expect(el().querySelector('.campaigns')).toBeNull();

    expect(rows().length).toBe(1);
    const row = squash(rows()[0].textContent);
    expect(row).toContain('Remoción de suelo');
    expect(row).toContain('7 sep 2026 ± 6 días');
    expect(row).toContain('Manual');
    expect(row).toContain('Estimado');
    expect(rows()[0].getAttribute('aria-haspopup')).toBe('dialog');
    expect(rows()[0].getAttribute('aria-expanded')).toBe('false');
    // sin imagen de evidencia no la promete
    expect(text()).toContain('1 evento · abrilo para ver el detalle');
    expect(row).not.toContain('con evidencia');
  });

  it('marca las filas con imagen de evidencia y recién ahí la promete', async () => {
    await render([
      makeEvent({ id: 1, evidence_image_url: '/media/evidence/radar.png' }),
      makeEvent({ id: 2, date: '2026-08-01' }),
    ]);
    const row = (id: number) => rows().find((item) => item.dataset['eventId'] === String(id));
    expect(row(1)?.querySelector('.row__evidence')).not.toBeNull();
    expect(squash(row(1)?.textContent)).toContain('con evidencia');
    expect(row(2)?.querySelector('.row__evidence')).toBeNull();
    expect(text()).toContain('2 eventos · abrí uno para ver su evidencia');
  });

  it('si todos los eventos son simulados lo dice una vez arriba, no en cada fila', async () => {
    await render([makeEvent({ id: 1 }), makeEvent({ id: 2, date: '2026-10-20' })]);

    expect(words(el().querySelector('.sim-all') as Element)).toBe(
      'Dato simulado para la demostración en todos los eventos',
    );
    expect(el().querySelectorAll('.row app-simulated-notice').length).toBe(0);
    // quien usa un lector de pantalla lo oye en cada fila
    expect(rows()[0].textContent).toContain('(dato simulado)');
  });

  it('si solo algunos son simulados, la marca va en esas filas', async () => {
    await render([
      makeEvent({ id: 1, is_simulated: true }),
      makeEvent({ id: 2, date: '2026-10-20', is_simulated: false, origin: 'VERIFIED' }),
    ]);

    expect(el().querySelector('.sim-all')).toBeNull();
    expect(rows()[0].querySelector('app-simulated-notice')).not.toBeNull();
    expect(rows()[1].querySelector('app-simulated-notice')).toBeNull();
  });

  it('sin campañas en los eventos agrupa por mes y deja las campañas arriba', async () => {
    await render([
      makeEvent({ id: 1, campaign: null, campaign_label: null, date: '2026-08-03' }),
      makeEvent({ id: 2, campaign: null, campaign_label: null, date: '2026-10-20' }),
    ]);

    const titles = [...el().querySelectorAll('.group__head')].map(words);
    expect(titles).toEqual(['Octubre de 2026 1 evento', 'Agosto de 2026 1 evento']);
    expect(words(el().querySelector('.campaign') as Element)).toContain('2025/26 Soja');
  });

  it('los filtros aparecen recién con muchos eventos, plegados detrás de "Filtrar"', async () => {
    const events = manyEvents();
    await render(events);

    const toggle = button('Filtrar');
    expect(toggle).toBeDefined();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(el().querySelector('select')).toBeNull();

    toggle?.click();
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    const [typeSelect, sensorSelect] = [...el().querySelectorAll('select')];
    // cada filtro ofrece solo lo que hay en la bitácora
    const types = [...typeSelect.options].map((option) => option.textContent?.trim());
    expect(types).toEqual([
      'Todos',
      'Siembra',
      'Cosecha',
      'Remoción de suelo',
      'Cultivo de cobertura',
      'Anegamiento',
    ]);
    expect([...sensorSelect.options].map((option) => option.value)).toEqual([
      '',
      'NISAR',
      'HLS',
      'LANDSAT',
    ]);

    typeSelect.value = 'HARVEST';
    typeSelect.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(rows().map((row) => squash(row.querySelector('.row__type')?.textContent))).toEqual([
      'Cosecha',
      'Cosecha',
    ]);
    expect(text()).toContain('2 de 7 eventos con los filtros elegidos.');
    expect(text()).toContain('1 filtro activo');

    button('Quitar filtros')?.click();
    await fixture.whenStable();
    expect(rows().length).toBe(Math.min(FILTERS_FROM, EVENTS_SHOWN));
    expect(button(`Ver los ${FILTERS_FROM} eventos`)).toBeDefined();
  });

  it('con pocos eventos no ofrece filtros', async () => {
    await render(manyEvents(FILTERS_FROM - 1));
    expect(button('Filtrar')).toBeUndefined();
  });

  it('con muchos eventos muestra los primeros y el resto se pide', async () => {
    await render(manyEvents(EVENTS_SHOWN + 3));

    expect(rows().length).toBe(EVENTS_SHOWN);
    const more = button(`Ver los ${EVENTS_SHOWN + 3} eventos`);
    expect(more?.getAttribute('aria-expanded')).toBe('false');

    more?.click();
    await fixture.whenStable();
    expect(rows().length).toBe(EVENTS_SHOWN + 3);
    expect(button('Ver menos')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('en el celular abre el detalle como hoja: retiene el foco y Escape la cierra sin seguir de largo', async () => {
    await render([
      makeEvent({
        sensor: 'NISAR',
        origin: 'VERIFIED',
        notes: 'Cambio de superficie compatible con una labranza.',
        evidence_image_url: '/media/evidence/a_nisar.png',
        evidence_optical_image_url: '/media/evidence/a_hls.png',
      }),
    ]);
    expect(panel()).toBeNull();

    await openRow();
    const sheet = panel() as HTMLElement;
    expect(sheet.classList).toContain('panel--sheet');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    const title = sheet.querySelector('h2');
    expect(title?.textContent).toContain('Remoción de suelo');
    expect(sheet.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(rows()[0].getAttribute('aria-expanded')).toBe('true');
    expect(rows()[0].getAttribute('aria-controls')).toBe(sheet.id);
    expect(sheet.textContent).toContain('NISAR (radar, banda L)');
    expect(sheet.textContent).toContain('Cambio de superficie compatible con una labranza.');
    expect(sheet.querySelector('app-radar-optical-compare')).not.toBeNull();
    // el foco entra a la hoja y la lista de atrás queda inerte, con el velo encima
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(list().hasAttribute('inert')).toBe(true);
    expect(el().querySelector('.scrim')).not.toBeNull();

    // Tab da la vuelta adentro de la hoja
    const focusable = [...sheet.querySelectorAll<HTMLElement>('button, input, summary')];
    focusable.at(-1)?.focus();
    expect((await press('Tab')).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusable[0]);
    expect((await press('Tab', true)).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusable.at(-1));

    // Escape cierra solo el detalle: no llega al popup del lote ni a la página
    let reachedDocument = false;
    const listener = () => (reachedDocument = true);
    document.addEventListener('keydown', listener);
    const escape = await press('Escape');
    document.removeEventListener('keydown', listener);
    expect(escape.defaultPrevented).toBe(true);
    expect(reachedDocument).toBe(false);
    expect(panel()).toBeNull();
    expect(list().hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(rows()[0]);
  });

  it('la X y un toque en el velo también cierran la hoja, con el foco de vuelta en el evento', async () => {
    await render();

    await openRow();
    (panel()?.querySelector('.panel__head button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(rows()[0]);

    await openRow();
    (el().querySelector('.scrim') as HTMLElement).click();
    await fixture.whenStable();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(rows()[0]);
  });

  it('en la compu el detalle va al costado de la lista, que sigue a mano', async () => {
    const restore = wideWindow();
    try {
      await render([
        makeEvent({ id: 1 }),
        makeEvent({ id: 2, type: 'HARVEST', type_label: 'Cosecha', date: '2026-11-02' }),
      ]);

      await openRow(0);
      const side = panel() as HTMLElement;
      expect(side.classList).toContain('panel--side');
      expect(side.hasAttribute('aria-modal')).toBe(false);
      expect(el().querySelector('.log')?.classList).toContain('log--split');
      expect(el().querySelector('.scrim')).toBeNull();
      expect(list().hasAttribute('inert')).toBe(false);
      expect(side.contains(document.activeElement)).toBe(true);

      // otro evento cambia el detalle sin cerrarlo
      await openRow(1);
      expect(squash(panel()?.querySelector('h2')?.textContent)).toBe('Cosecha');

      await press('Escape');
      expect(panel()).toBeNull();
      expect(el().querySelector('.log')?.classList).not.toContain('log--split');
      expect(document.activeElement).toBe(rows()[1]);
    } finally {
      restore();
    }
  });

  it('en un lote de solo lectura el detalle no ofrece confirmar ni corregir', async () => {
    await render([makeEvent()], { editable: false });
    await openRow();
    expect(panel()?.querySelector('app-event-log-item')).not.toBeNull();
    expect(button('Confirmar')).toBeUndefined();
    expect(button('Corregir')).toBeUndefined();
  });

  it('un lote de ejemplo es de solo lectura aunque llegue editable', async () => {
    await render([makeEvent({ evidence_optical_image_url: '/media/evidence/hls.png' })], {
      lot: EXAMPLE,
      editable: true,
    });
    expect(text()).toContain('abrilo para ver su evidencia');
    await openRow();
    expect(button('Confirmar')).toBeUndefined();
    expect(button('Corregir')).toBeUndefined();
  });

  it('en un lote propio confirma desde el detalle y la fila muestra el nuevo origen', async () => {
    await render([makeEvent()], { editable: true });
    const reviewed: EventLogItem[] = [];
    fixture.componentInstance.reviewed.subscribe((event) => reviewed.push(event));
    expect(text()).toContain('1 evento · abrilo para revisarlo');
    await openRow();
    expect(button('Corregir')).toBeDefined();

    button('Confirmar')?.click();
    const request = http.expectOne('/api/events/1/');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ confirm: true });
    request.flush(makeEvent({ origin: 'DECLARED' }));
    await fixture.whenStable();

    expect(panel()?.textContent).toContain('ahora figura como dato declarado');
    expect(rows()[0].textContent).toContain('Declarado');
    // el espacio del lote se entera, así las marcas del verdor muestran el evento revisado
    expect(reviewed.map((event) => event.origin)).toEqual(['DECLARED']);
  });

  it('si falla la red, lo dice y deja reintentar', async () => {
    fixture = TestBed.createComponent(LotLog);
    fixture.componentRef.setInput('lot', LOT);
    await fixture.whenStable();
    http.expectOne('/api/lots/1/events/').flush('', { status: 0, statusText: 'Unknown Error' });
    await fixture.whenStable();
    expect(text()).toContain('No se pudo cargar la bitácora');

    button('Reintentar')?.click();
    await fixture.whenStable();
    http
      .expectOne('/api/lots/1/events/')
      .flush({ lot: 1, count: 1, message: null, events: [makeEvent()] });
    await fixture.whenStable();
    expect(rows().length).toBe(1);
  });
});
