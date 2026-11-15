import { Component, computed, input } from '@angular/core';

import { NO_DATA, formatNumber, formatValue } from '../format';
import { chartLabel, countLabel } from '../kit/a11y';
import { ChartFrame, ChartTable } from '../kit/chart-frame/chart-frame';
import { injectHostWidth, nextChartId } from '../kit/host-width';
import { columnPath } from '../kit/paths';
import { FONT_SIZE, STACK_BELOW } from '../kit/rows';
import { estimateTextWidth } from '../kit/text';
import { noDataFill, textureFill } from '../kit/tones';
import { linearScale, niceTicks } from '../scale';
import { ChartTone, ColumnItem } from '../types';

interface MissingColumn {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  textWidth: number;
  /** la columna es más angosta que el texto: se escribe en vertical */
  rotate: boolean;
}

interface ColumnBox {
  key: number;
  tone: ChartTone;
  fill: string | null;
  d: string | null;
  down: boolean;
  missing: MissingColumn | null;
  value: { text: string; x: number; y: number } | null;
  label: { text: string; x: number } | null;
  highlighted: boolean;
  dim: boolean;
  hint: string;
}

interface ColumnView {
  width: number;
  height: number;
  left: number;
  right: number;
  zeroY: number;
  labelY: number;
  yTicks: { key: string; y: number; label: string }[];
  columns: ColumnBox[];
  noData: string;
}

/** con más columnas que esto no se escribe el valor de cada una */
const MAX_VALUE_LABELS = 16;
/** por encima de esta cantidad el aria-label resume en vez de enumerar */
const MAX_LISTED = 24;

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function buildView(
  items: readonly ColumnItem[],
  unit: string,
  decimals: number,
  highlight: number | undefined,
  width: number,
  uid: string,
): ColumnView {
  const values = items.map((item) => item.value).filter(isNumber);
  // en el celular, más baja: la tarjeta de la lluvia no estira la pista de tarjetas
  const plotHeight = width < STACK_BELOW ? 120 : 170;
  const nice = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
  const tickLabels = nice.values.map((value) => formatNumber(value, nice.decimals));
  const left = Math.max(
    24,
    Math.ceil(Math.max(...tickLabels.map((t) => estimateTextWidth(t)))) + 10,
  );
  const right = width - 4;
  const top = 22;
  const bottom = top + plotHeight;
  const y = linearScale(nice.domain, [bottom, top], true);
  const zeroY = y(0);

  const band = (right - left) / Math.max(1, items.length);
  const columnWidth = Math.min(44, Math.max(2, band * 0.64));
  const valueText = (value: number) => formatNumber(value, decimals);
  const widestValue = Math.max(
    0,
    ...values.map((value) => estimateTextWidth(valueText(value), FONT_SIZE, true)),
  );
  const showValues = items.length <= MAX_VALUE_LABELS && widestValue + 4 <= band;
  const widestLabel = Math.max(0, ...items.map((item) => estimateTextWidth(item.label)));
  const every = Math.max(1, Math.ceil((widestLabel + 8) / band));
  const target = highlight !== undefined && items[highlight] ? highlight : null;
  const noDataWidth = estimateTextWidth(NO_DATA);

  const columns = items.map((item, index): ColumnBox => {
    const tone = item.tone ?? 'neutral';
    const x = left + band * index + (band - columnWidth) / 2;
    const cx = x + columnWidth / 2;
    const highlighted = index === target;
    // el rótulo destacado siempre se ve: sus vecinos ceden el lugar si no entran
    const labelShown =
      highlighted ||
      (index % every === 0 && (target === null || Math.abs(index - target) >= every));
    const hintValue = formatValue(item.value, unit, decimals);
    const base: ColumnBox = {
      key: index,
      tone,
      fill: textureFill(uid, tone),
      d: null,
      down: false,
      missing: null,
      value: null,
      label: labelShown ? { text: item.label, x: cx } : null,
      highlighted,
      dim: target !== null && !highlighted,
      hint: `${item.label}: ${hintValue}${item.note ? ` (${item.note})` : ''}`,
    };
    if (!isNumber(item.value)) {
      return {
        ...base,
        missing: {
          x,
          y: top,
          width: columnWidth,
          height: bottom - top,
          cx,
          cy: (top + bottom) / 2,
          textWidth: noDataWidth,
          rotate: columnWidth < noDataWidth + 8,
        },
      };
    }
    const y1 = y(item.value);
    const down = item.value < 0;
    // un valor distinto de cero siempre deja una columna visible
    const end = item.value === 0 ? zeroY : down ? Math.max(y1, zeroY + 2) : Math.min(y1, zeroY - 2);
    return {
      ...base,
      d: item.value === 0 ? null : columnPath(x, columnWidth, zeroY, end),
      down,
      value:
        showValues || highlighted
          ? { text: valueText(item.value), x: cx, y: down ? end + 14 : end - 6 }
          : null,
    };
  });

  return {
    width,
    height: bottom + 26,
    left,
    right,
    zeroY,
    labelY: bottom + 18,
    yTicks: nice.values.map((value, index) => ({
      key: `${value}`,
      y: y(value),
      label: tickLabels[index],
    })),
    columns,
    noData: noDataFill(uid),
  };
}

/**
 * columnas verticales en el tiempo, por ejemplo la lluvia mensual de NASA POWER. un valor
 * null se dibuja como columna con trama y "Sin dato", nunca como cero. con `highlight` se
 * destaca una columna (su valor y su rótulo quedan siempre a la vista)
 *
 * @example
 * <app-column-chart
 *   title="Lluvia mensual (NASA POWER)"
 *   unit="mm"
 *   [items]="[{ label: 'sep', value: 48 }, { label: 'oct', value: null, note: 'sin registro' }]"
 *   [highlight]="1"
 * />
 */
@Component({
  selector: 'app-column-chart',
  imports: [ChartFrame],
  styleUrls: ['../kit/kit.css', './column-chart.css'],
  templateUrl: './column-chart.html',
  host: { '[attr.title]': 'null' },
})
export class ColumnChart {
  readonly items = input<readonly ColumnItem[]>([]);
  readonly unit = input('');
  readonly decimals = input(0);
  /** índice de la columna destacada */
  readonly highlight = input<number>();
  readonly title = input<string>();
  readonly description = input<string>();
  readonly emptyText = input('No data to show');

  protected readonly uid = nextChartId('cols');
  private readonly width = injectHostWidth();

  protected readonly empty = computed(() => this.items().length === 0);

  protected readonly view = computed(() =>
    buildView(this.items(), this.unit(), this.decimals(), this.highlight(), this.width(), this.uid),
  );

  protected readonly label = computed(() => {
    const items = this.items();
    const unit = this.unit();
    const decimals = this.decimals();
    const valued = items.filter((item) => isNumber(item.value));
    const missing = items.length - valued.length;
    let detail: string;
    if (items.length <= MAX_LISTED) {
      detail = items
        .map((item) => `${item.label}: ${formatValue(item.value, unit, decimals)}`)
        .join('; ');
    } else if (valued.length) {
      const max = valued.reduce((best, item) =>
        (item.value as number) > (best.value as number) ? item : best,
      );
      const min = valued.reduce((best, item) =>
        (item.value as number) < (best.value as number) ? item : best,
      );
      detail = `maximum ${formatValue(max.value, unit, decimals)} in ${max.label}, minimum ${formatValue(min.value, unit, decimals)} in ${min.label}`;
    } else {
      detail = `${NO_DATA} in any column`;
    }
    const highlighted = this.highlight();
    const target = highlighted !== undefined ? items[highlighted] : undefined;
    const summary =
      `Column chart with ${countLabel(items.length, 'value', 'values')}. ${detail}.` +
      (missing && items.length <= MAX_LISTED
        ? ` ${countLabel(missing, 'column', 'columns')} with no data.`
        : '') +
      (target
        ? ` Highlighted: ${target.label}, ${formatValue(target.value, unit, decimals)}.`
        : '');
    return chartLabel(this.description(), summary);
  });

  protected readonly table = computed((): ChartTable => {
    const items = this.items();
    const unit = this.unit();
    const decimals = this.decimals();
    const withNotes = items.some((item) => !!item.note);
    return {
      caption: this.title() ?? 'Column chart data',
      columns: ['Period', unit ? `Value (${unit})` : 'Value', ...(withNotes ? ['Note'] : [])],
      rows: items.map((item) => [
        item.label,
        formatNumber(item.value, decimals),
        ...(withNotes ? [item.note ?? ''] : []),
      ]),
    };
  });
}
