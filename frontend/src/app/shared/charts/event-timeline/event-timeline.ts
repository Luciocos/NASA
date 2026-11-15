import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';

import { EventType, ORIGIN_LABELS, Origin } from '../../../core/models';
import { NO_DATA, formatDate, formatDateWithUncertainty, formatUncertainty } from '../format';
import { chartLabel, countLabel } from '../kit/a11y';
import { ChartFrame, ChartTable } from '../kit/chart-frame/chart-frame';
import { injectHostWidth } from '../kit/host-width';
import { shapePath } from '../kit/paths';
import { FONT_SIZE, STACK_BELOW } from '../kit/rows';
import { TimeAxis, timeAxis, todayIso } from '../kit/time-axis';
import { maxLineWidth, wrapText } from '../kit/text';
import { ORIGIN_SHAPE } from '../kit/tones';
import { isoToDay, linearScale } from '../scale';
import { ChartTone, ORIGIN_TONE, TimelineEvent } from '../types';

type EventId = number | string;

interface LaneView {
  key: string;
  label: string;
  labelY: number;
  y: number;
}

interface MarkView {
  key: string;
  id: EventId;
  event: TimelineEvent;
  x: number;
  y: number;
  tone: ChartTone;
  shape: string;
  hollow: boolean;
  /** contorno discontinuo del dato simulado */
  halo: string | null;
  ring: string;
  whisker: { x1: number; x2: number } | null;
  label: string;
}

interface TimelineView {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  axisY: number;
  lanes: LaneView[];
  axis: TimeAxis;
  marks: MarkView[];
  today: { x: number; anchor: 'middle' | 'end' } | null;
}

interface TipView {
  title: string;
  lines: string[];
  left: number;
  top: number;
  below: boolean;
  align: 'start' | 'center' | 'end';
}

interface LegendItem {
  key: string;
  label: string;
  tone: ChartTone;
  kind: 'shape' | 'halo' | 'whisker';
  shape: string;
  hollow: boolean;
}

/** orden fijo de las filas: el mismo para todos los lotes */
const TYPE_ORDER: readonly EventType[] = [
  'SOWING',
  'HARVEST',
  'TILLAGE',
  'COVER_CROP',
  'FLOODING',
  'BURN',
  'LAND_USE_CHANGE',
];
const ORIGIN_ORDER: readonly Origin[] = ['VERIFIED', 'DECLARED', 'ESTIMATED'];
const ORIGIN_HINT: Record<Origin, string> = {
  VERIFIED: 'Verificado (satélite)',
  DECLARED: 'Declarado (productor)',
  ESTIMATED: 'Estimado (modelo o referencia)',
};
const RADIUS = 6;
const TOP = 26;

function uncertainty(event: TimelineEvent): number {
  const days = event.uncertaintyDays;
  return typeof days === 'number' && Number.isFinite(days) && days > 0 ? days : 0;
}

function originText(origin: Origin): string {
  return (ORIGIN_LABELS[origin] ?? origin).toLowerCase();
}

/** texto completo de un evento: "Siembra, 07/09/2026 ± 6 días, NISAR, verificado" */
export function eventText(event: TimelineEvent): string {
  const parts = [event.typeLabel, formatDateWithUncertainty(event.date, event.uncertaintyDays)];
  if (event.uncertaintyDays === null) {
    parts.push('incertidumbre sin dato');
  }
  parts.push(event.sensorLabel, originText(event.origin));
  if (event.campaignLabel) {
    parts.push(`campaña ${event.campaignLabel}`);
  }
  if (event.simulated) {
    parts.push('dato simulado para la demostración');
  }
  return parts.join(', ');
}

function chronological(events: readonly TimelineEvent[]): { event: TimelineEvent; day: number }[] {
  return events
    .map((event) => ({ event, day: isoToDay(event.date) }))
    .filter((item) => Number.isFinite(item.day))
    .sort((a, b) => a.day - b.day || String(a.event.id).localeCompare(String(b.event.id)));
}

function laneTypes(events: readonly TimelineEvent[]): EventType[] {
  const present = new Set(events.map((event) => event.type));
  const types = TYPE_ORDER.filter((type) => present.has(type));
  // un tipo que todavía no conoce el frontend va al final, en orden de aparición
  for (const event of events) {
    if (!types.includes(event.type)) {
      types.push(event.type);
    }
  }
  return types;
}

function buildView(events: readonly TimelineEvent[], today: string, width: number): TimelineView {
  const stacked = width < STACK_BELOW;
  const placed = chronological(events);
  const types = laneTypes(placed.map((item) => item.event));
  const laneHeight = stacked ? 52 : 38;
  const labelTexts = types.map((type) => {
    const text = placed.find((item) => item.event.type === type)?.event.typeLabel ?? type;
    return wrapText(text, stacked ? width - 8 : 150, FONT_SIZE, 1)[0];
  });
  const left = stacked ? RADIUS + 8 : Math.ceil(maxLineWidth(labelTexts)) + 22;
  const right = width - RADIUS - 8;

  const todayDay = isoToDay(today);
  const starts = placed.map((item) => item.day - uncertainty(item.event));
  const ends = placed.map((item) => item.day + uncertainty(item.event));
  if (Number.isFinite(todayDay)) {
    ends.push(todayDay);
  }
  const start = Math.min(...starts);
  const end = Math.max(...ends);
  const pad = Math.max(10, (end - start) * 0.03);
  const scale = linearScale([start - pad, end + pad], [left, right]);

  const lanes = types.map((type, index): LaneView => {
    const laneTop = TOP + index * laneHeight;
    return {
      key: type,
      label: labelTexts[index],
      labelY: stacked ? laneTop + 12 : laneTop + laneHeight / 2 + 4,
      y: stacked ? laneTop + 34 : laneTop + laneHeight / 2,
    };
  });
  const axisY = TOP + types.length * laneHeight + 2;

  const marks = placed.map(({ event, day }): MarkView => {
    const lane = lanes[types.indexOf(event.type)];
    const shape = ORIGIN_SHAPE[event.origin] ?? 'circle';
    const days = uncertainty(event);
    return {
      key: String(event.id),
      id: event.id,
      event,
      x: scale(day),
      y: lane.y,
      tone: ORIGIN_TONE[event.origin] ?? 'neutral',
      shape: shapePath(shape, RADIUS),
      hollow: shape === 'ring',
      halo: event.simulated ? shapePath(shape === 'ring' ? 'circle' : shape, RADIUS + 3.5) : null,
      ring: shapePath('circle', RADIUS + 7),
      whisker: days > 0 ? { x1: scale(day - days), x2: scale(day + days) } : null,
      label: eventText(event),
    };
  });

  const todayX = Number.isFinite(todayDay) ? scale(todayDay) : null;
  return {
    width,
    height: axisY + 24,
    left,
    right,
    top: TOP,
    axisY,
    lanes,
    axis: timeAxis(scale, width, stacked ? 56 : 64),
    marks,
    today: todayX === null ? null : { x: todayX, anchor: todayX > width - 16 ? 'end' : 'middle' },
  };
}

/**
 * bitácora de eventos en el tiempo: una fila por tipo, del primer evento a hoy. la forma de
 * la marca dice el origen además del color (verificado círculo lleno, declarado rombo,
 * estimado círculo hueco), el bigote muestra la incertidumbre de la fecha y el dato
 * simulado lleva contorno discontinuo. las marcas se recorren con Tab y las flechas, y
 * Enter o Espacio las seleccionan
 *
 * @example
 * <app-event-timeline
 *   title="Bitácora del lote"
 *   [events]="events"
 *   [selectedId]="selected()"
 *   (eventSelect)="selected.set($event)"
 * />
 */
@Component({
  selector: 'app-event-timeline',
  imports: [ChartFrame],
  styleUrls: ['../kit/kit.css', './event-timeline.css'],
  templateUrl: './event-timeline.html',
  host: { '[attr.title]': 'null' },
})
export class EventTimelineChart {
  readonly events = input<readonly TimelineEvent[]>([]);
  /** evento seleccionado: queda resaltado y con aria-pressed */
  readonly selectedId = input<EventId | null>(null);
  /** fin del eje y línea "Hoy", AAAA-MM-DD. por defecto la fecha local */
  readonly today = input<string>();
  readonly title = input<string>();
  readonly description = input<string>();
  readonly emptyText = input('Sin eventos para mostrar');

  /** se emite al hacer clic o con Enter o Espacio sobre una marca */
  readonly eventSelect = output<EventId>();

  private readonly width = injectHostWidth();
  private readonly plot = viewChild<ElementRef<SVGSVGElement>>('plot');
  protected readonly hoverIndex = signal<number | null>(null);
  protected readonly focusIndex = signal<number | null>(null);

  private readonly todayValue = computed(() => this.today() || todayIso());

  protected readonly empty = computed(() => chronological(this.events()).length === 0);

  protected readonly view = computed(() =>
    buildView(this.events(), this.todayValue(), this.width()),
  );

  private readonly selectedIndex = computed(() => {
    const id = this.selectedId();
    const index = this.view().marks.findIndex((mark) => mark.id === id);
    return index < 0 ? null : index;
  });

  /** única marca con tabindex 0: la enfocada, la seleccionada o la más reciente */
  protected readonly tabStop = computed(
    () => this.focusIndex() ?? this.selectedIndex() ?? this.view().marks.length - 1,
  );

  protected readonly tip = computed((): TipView | null => {
    const index = this.hoverIndex() ?? this.focusIndex();
    const v = this.view();
    const mark = index === null ? undefined : v.marks[index];
    if (!mark) {
      return null;
    }
    const { event } = mark;
    const lines = [
      formatDateWithUncertainty(event.date, event.uncertaintyDays),
      `Sensor: ${event.sensorLabel}`,
      `Origen: ${originText(event.origin)}`,
    ];
    if (event.uncertaintyDays === null) {
      lines.splice(1, 0, `Incertidumbre: ${NO_DATA}`);
    }
    if (event.campaignLabel) {
      lines.push(`Campaña ${event.campaignLabel}`);
    }
    if (event.simulated) {
      lines.push('Dato simulado para la demostración');
    }
    const below = mark.y < 90;
    return {
      title: event.typeLabel,
      lines,
      left: (mark.x / v.width) * 100,
      top: ((below ? mark.y + 14 : mark.y - 14) / v.height) * 100,
      below,
      align: mark.x < 110 ? 'start' : mark.x > v.width - 110 ? 'end' : 'center',
    };
  });

  protected readonly legend = computed((): LegendItem[] => {
    const events = this.events();
    const items: LegendItem[] = ORIGIN_ORDER.filter((origin) =>
      events.some((event) => event.origin === origin),
    ).map((origin) => ({
      key: origin,
      label: ORIGIN_HINT[origin],
      tone: ORIGIN_TONE[origin],
      kind: 'shape',
      shape: shapePath(ORIGIN_SHAPE[origin], 5),
      hollow: ORIGIN_SHAPE[origin] === 'ring',
    }));
    if (events.some((event) => uncertainty(event) > 0)) {
      items.push({
        key: 'whisker',
        label: '± incertidumbre de la fecha',
        tone: 'neutral',
        kind: 'whisker',
        shape: '',
        hollow: false,
      });
    }
    if (events.some((event) => event.simulated)) {
      items.push({
        key: 'simulated',
        label: 'Dato simulado para la demostración (contorno discontinuo)',
        tone: 'neutral',
        kind: 'halo',
        shape: shapePath('circle', 6.5),
        hollow: true,
      });
    }
    return items;
  });

  protected readonly label = computed(() => {
    const placed = chronological(this.events());
    if (placed.length === 0) {
      return chartLabel(this.description(), 'Línea de tiempo sin eventos.');
    }
    const events = placed.map((item) => item.event);
    const types = laneTypes(events).map((type) => {
      const ofType = events.filter((event) => event.type === type);
      return `${ofType[0].typeLabel}: ${ofType.length}`;
    });
    const origins = ORIGIN_ORDER.map((origin) => {
      const count = events.filter((event) => event.origin === origin).length;
      const word = originText(origin);
      return count ? countLabel(count, word, `${word}s`) : '';
    }).filter(Boolean);
    const simulated = events.filter((event) => event.simulated).length;
    const summary =
      `Línea de tiempo con ${countLabel(events.length, 'evento', 'eventos')}, ` +
      `del ${formatDate(events[0].date)} al ${formatDate(events[events.length - 1].date)}, ` +
      `una fila por tipo. ${types.join('; ')}. Orígenes: ${origins.join(', ')}.` +
      (simulated
        ? ` ${countLabel(simulated, 'dato simulado', 'datos simulados')} para la demostración.`
        : '') +
      ` Hoy: ${formatDate(this.todayValue())}.`;
    return chartLabel(this.description(), summary);
  });

  protected readonly table = computed((): ChartTable => {
    const events = this.events();
    const placed = chronological(events).map((item) => item.event);
    const rest = events.filter((event) => !placed.includes(event));
    const withCampaign = events.some((event) => !!event.campaignLabel);
    const columns = ['Evento', 'Fecha', 'Incertidumbre', 'Sensor', 'Origen'];
    if (withCampaign) {
      columns.push('Campaña');
    }
    columns.push('Dato simulado');
    return {
      caption: this.title() ?? 'Eventos de la línea de tiempo',
      columns,
      rows: [...placed, ...rest].map((event) => {
        const row = [
          event.typeLabel,
          formatDate(event.date),
          event.uncertaintyDays === null
            ? NO_DATA
            : formatUncertainty(event.uncertaintyDays) || 'Sin incertidumbre',
          event.sensorLabel,
          ORIGIN_LABELS[event.origin] ?? event.origin,
        ];
        if (withCampaign) {
          row.push(event.campaignLabel ?? NO_DATA);
        }
        row.push(event.simulated ? 'Sí' : 'No');
        return row;
      }),
    };
  });

  protected select(index: number): void {
    const mark = this.view().marks[index];
    if (mark) {
      this.eventSelect.emit(mark.id);
    }
  }

  protected onKey(event: KeyboardEvent, index: number): void {
    const last = this.view().marks.length - 1;
    let next: number;
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.select(index);
        return;
      case 'ArrowRight':
      case 'ArrowDown':
        next = Math.min(last, index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = Math.max(0, index - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.focusIndex.set(next);
    this.plot()?.nativeElement.querySelectorAll<SVGGElement>('.mark')[next]?.focus();
  }
}
