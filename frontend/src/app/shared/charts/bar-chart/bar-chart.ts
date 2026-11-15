import { Component, computed, input } from '@angular/core';

import { NO_DATA, formatNumber, formatValue } from '../format';
import { chartLabel } from '../kit/a11y';
import { ChartFrame, ChartTable } from '../kit/chart-frame/chart-frame';
import { injectHostWidth, nextChartId } from '../kit/host-width';
import { barPath } from '../kit/paths';
import { BAR_HEIGHT, EndLabel, FONT_SIZE, RowsLayout, fitScale, layoutRows } from '../kit/rows';
import { estimateTextWidth } from '../kit/text';
import { noDataFill, textureFill } from '../kit/tones';
import { LinearScale, niceTicks } from '../scale';
import { BarItem, BarThreshold, ChartTone } from '../types';

interface TextLine {
  text: string;
  y: number;
}

interface MissingBand {
  x: number;
  y: number;
  width: number;
  textX: number;
  textY: number;
  textWidth: number;
}

interface RowView {
  key: number;
  labelLines: TextLine[];
  note: TextLine | null;
  tone: ChartTone;
  /** referencia a la trama, o null si el tono es liso */
  fill: string | null;
  bar: string | null;
  /** la barra crece hacia la izquierda (valor negativo) */
  back: boolean;
  missing: MissingBand | null;
  valueText: string;
  valueX: number;
  valueY: number;
  valueAnchor: 'start' | 'end';
  hint: string;
}

interface Span {
  y1: number;
  y2: number;
}

interface TickView {
  x: number;
  label: string;
}

interface ThresholdView {
  key: string;
  x: number;
  spans: Span[];
  label: string | null;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'end';
}

interface BarChartView {
  width: number;
  height: number;
  rows: RowView[];
  ticks: TickView[];
  /** tramos verticales de la grilla: uno solo, o uno por fila si el rótulo va arriba */
  spans: Span[];
  tickY: number;
  zeroX: number | null;
  thresholds: ThresholdView[];
  noData: string;
}

interface ReferenceLine {
  key: string;
  value: number;
  label: string;
  /** copia en negativo de una línea simétrica */
  mirrored: boolean;
}

const CAPTION_ROW = 20;
const VALUE_GAP = 6;

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function referenceLines(thresholds: readonly BarThreshold[]): ReferenceLine[] {
  const lines: ReferenceLine[] = [];
  thresholds.forEach((threshold, index) => {
    if (!isNumber(threshold.value)) {
      return;
    }
    lines.push({
      key: `${index}`,
      value: threshold.value,
      label: threshold.label,
      mirrored: false,
    });
    if (threshold.symmetric && threshold.value !== 0) {
      lines.push({
        key: `${index}-mirror`,
        value: -threshold.value,
        label: threshold.label,
        mirrored: true,
      });
    }
  });
  return lines.sort((a, b) => a.value - b.value);
}

/**
 * ubica los rótulos de las líneas de referencia al costado de cada línea, sin pisarse.
 * si uno no entra a ningún lado sube a otra fila; el de la copia simétrica directamente
 * se omite, porque la línea gemela ya lo lleva
 */
function placeThresholds(
  lines: readonly ReferenceLine[],
  scale: LinearScale,
  width: number,
): { views: Omit<ThresholdView, 'spans'>[]; rows: number } {
  const taken: { from: number; to: number; row: number }[] = [];
  const free = (from: number, to: number, row: number) =>
    from >= 0 &&
    to <= width &&
    !taken.some((slot) => slot.row === row && from < slot.to + 8 && to > slot.from - 8);
  let rows = 0;
  const views = lines.map((line) => {
    const x = scale(line.value);
    const textWidth = estimateTextWidth(line.label, FONT_SIZE);
    const sides: ('start' | 'end')[] = line.value < 0 ? ['end', 'start'] : ['start', 'end'];
    const view = {
      key: line.key,
      x,
      label: null as string | null,
      labelX: x,
      labelY: 0,
      anchor: sides[0],
    };
    if (!line.label) {
      return view;
    }
    const maxRow = line.mirrored ? 0 : 3;
    for (let row = 0; row <= maxRow; row++) {
      for (const side of sides) {
        const from = side === 'start' ? x + 5 : x - 5 - textWidth;
        if (free(from, from + textWidth, row)) {
          taken.push({ from, to: from + textWidth, row });
          rows = Math.max(rows, row + 1);
          return {
            ...view,
            label: line.label,
            labelX: side === 'start' ? x + 5 : x - 5,
            labelY: row,
            anchor: side,
          };
        }
      }
    }
    return view;
  });
  return { views, rows };
}

function buildView(
  items: readonly BarItem[],
  unit: string,
  decimals: number,
  thresholds: readonly BarThreshold[],
  domainInput: readonly [number, number] | undefined,
  width: number,
  uid: string,
): BarChartView {
  const layout: RowsLayout = layoutRows(items, width);
  const values = items.map((item) => item.value).filter(isNumber);
  const lines = referenceLines(thresholds);
  const hasDomain = !!domainInput && isNumber(domainInput[0]) && isNumber(domainInput[1]);
  const hasScale = values.length > 0 || lines.length > 0 || hasDomain;
  const left = layout.plotLeft + 1;
  const right = width - 1;
  const valueText = (value: number) => formatValue(value, unit, decimals);
  const valueWidth = (value: number) => estimateTextWidth(valueText(value), FONT_SIZE, true);

  let scale: LinearScale | null = null;
  let ticks: TickView[] = [];
  let placed: { views: Omit<ThresholdView, 'spans'>[]; rows: number } = { views: [], rows: 0 };
  if (hasScale) {
    const reserveEnd = Math.max(0, ...values.filter((v) => v >= 0).map(valueWidth));
    const reserveStart = Math.max(0, ...values.filter((v) => v < 0).map(valueWidth));
    const room = right - left - reserveEnd - reserveStart - 2 * VALUE_GAP;
    const count = Math.min(8, Math.max(2, Math.floor(room / 80)));
    const extent = [...values, ...lines.map((line) => line.value), 0];
    const nice = hasDomain
      ? niceTicks(domainInput[0], domainInput[1], count)
      : niceTicks(Math.min(...extent), Math.max(...extent), count);
    const domain: [number, number] = hasDomain
      ? [Math.min(domainInput[0], domainInput[1]), Math.max(domainInput[0], domainInput[1])]
      : nice.domain;
    const clampValue = (value: number) => Math.min(domain[1], Math.max(domain[0], value));
    const endLabels: EndLabel[] = values.map((value) => ({
      value: clampValue(value),
      width: valueWidth(value),
      side: value < 0 ? 'start' : 'end',
    }));
    const fitted = fitScale(domain, left, right, endLabels, VALUE_GAP);
    scale = fitted;
    ticks = nice.values
      .filter((value) => value >= domain[0] && value <= domain[1])
      .map((value) => ({ x: fitted(value), label: formatNumber(value, nice.decimals) }));
    placed = placeThresholds(
      lines.filter((line) => line.value >= domain[0] && line.value <= domain[1]),
      fitted,
      width,
    );
  }

  const top = placed.rows > 0 ? placed.rows * CAPTION_ROW + 2 : 2;
  const bottom = top + layout.height;
  const spans: Span[] = layout.stacked
    ? layout.rows.map((row) => ({ y1: top + row.barY - 4, y2: top + row.barY + BAR_HEIGHT + 4 }))
    : [{ y1: top, y2: bottom }];
  const zero = scale ? Math.min(scale.domain[1], Math.max(scale.domain[0], 0)) : 0;
  const bandLeft = scale ? Math.min(scale.range[0], scale.range[1]) : left;
  const bandRight = scale ? Math.max(scale.range[0], scale.range[1]) : right;
  const noDataWidth = estimateTextWidth(NO_DATA, FONT_SIZE);

  const rows = items.map((item, index): RowView => {
    const box = layout.rows[index];
    const tone = item.tone ?? 'neutral';
    const barY = top + box.barY;
    const valueY = barY + BAR_HEIGHT / 2 + 4;
    const base: RowView = {
      key: index,
      labelLines: box.labelLines.map((text, line) => ({ text, y: top + box.labelYs[line] })),
      note: box.note ? { text: box.note, y: top + box.noteY } : null,
      tone,
      fill: textureFill(uid, tone),
      bar: null,
      back: false,
      missing: null,
      valueText: NO_DATA,
      valueX: 0,
      valueY,
      valueAnchor: 'start',
      hint: `${item.label}: ${NO_DATA}`,
    };
    if (!isNumber(item.value) || !scale) {
      return {
        ...base,
        missing: {
          x: bandLeft,
          y: barY,
          width: bandRight - bandLeft,
          textX: bandLeft + 10,
          textY: valueY,
          textWidth: noDataWidth,
        },
      };
    }
    const x0 = scale(zero);
    const x1 = scale(item.value);
    const back = item.value < 0;
    // un valor distinto de cero siempre deja una barra visible, aunque sea mínima
    const end = item.value === 0 ? x0 : back ? Math.min(x1, x0 - 2) : Math.max(x1, x0 + 2);
    return {
      ...base,
      bar: item.value === 0 ? null : barPath(x0, end, barY, BAR_HEIGHT),
      back,
      valueText: valueText(item.value),
      valueX: back ? end - VALUE_GAP : end + VALUE_GAP,
      valueAnchor: back ? 'end' : 'start',
      hint: `${item.label}: ${valueText(item.value)}`,
    };
  });

  const thresholdViews = placed.views.map((view): ThresholdView => {
    const captionTop = top - 2 - (view.labelY + 1) * CAPTION_ROW;
    const stub: Span = { y1: view.label ? captionTop + 3 : top - 4, y2: top };
    return {
      ...view,
      labelY: captionTop + 14,
      spans: layout.stacked ? [stub, ...spans] : [{ y1: stub.y1, y2: bottom }],
    };
  });

  return {
    width,
    height: bottom + (hasScale ? 22 : 2),
    rows,
    ticks,
    spans,
    tickY: bottom + 16,
    zeroX: scale ? scale(zero) : null,
    thresholds: thresholdViews,
    noData: noDataFill(uid),
  };
}

/**
 * barras horizontales para comparar pocos valores con su unidad. admite negativos (las
 * barras divergen desde el eje cero), líneas de referencia rotuladas y valores faltantes,
 * que se dibujan como una fila con trama y el texto "Sin dato": nunca se rellenan
 *
 * @example
 * <app-bar-chart
 *   title="Cambio de retrodispersión"
 *   unit="dB"
 *   [decimals]="2"
 *   [items]="[{ label: 'HH', value: -1.78 }, { label: 'HV', value: 0.81 }]"
 *   [thresholds]="[{ value: 1.03, label: 'Umbral', symmetric: true }]"
 * />
 */
@Component({
  selector: 'app-bar-chart',
  imports: [ChartFrame],
  styleUrls: ['../kit/kit.css', './bar-chart.css'],
  templateUrl: './bar-chart.html',
  // title es también un atributo nativo: sin esto el navegador mostraría su globo
  host: { '[attr.title]': 'null' },
})
export class BarChart {
  /** filas del gráfico, en el orden en que se dibujan */
  readonly items = input<readonly BarItem[]>([]);
  /** unidad que acompaña a cada valor ("dB", "kg CO2e/t") */
  readonly unit = input('');
  /** decimales de los valores */
  readonly decimals = input(1);
  /** líneas de referencia verticales */
  readonly thresholds = input<readonly BarThreshold[]>([]);
  /** dominio fijo del eje. por defecto sale de los datos, siempre incluye el cero */
  readonly domain = input<readonly [number, number]>();
  /** título visible arriba de la gráfica */
  readonly title = input<string>();
  /** texto alternativo: encabeza el aria-label, antes del resumen de los datos */
  readonly description = input<string>();
  /** texto del estado vacío */
  readonly emptyText = input('No data to show');

  protected readonly uid = nextChartId('bars');
  private readonly width = injectHostWidth();

  protected readonly empty = computed(() => this.items().length === 0);

  protected readonly view = computed(() =>
    buildView(
      this.items(),
      this.unit(),
      this.decimals(),
      this.thresholds(),
      this.domain(),
      this.width(),
      this.uid,
    ),
  );

  protected readonly label = computed(() => {
    const unit = this.unit();
    const decimals = this.decimals();
    const items = this.items();
    const bars = items.map((item) => `${item.label}: ${formatValue(item.value, unit, decimals)}`);
    const references = this.thresholds().map(
      (line) =>
        `${line.label}: ${line.symmetric ? '±' : ''}${formatValue(line.value, unit, decimals)}`,
    );
    const summary =
      `Bar chart with ${items.length} ${items.length === 1 ? 'value' : 'values'}. ` +
      `${bars.join('; ')}.` +
      (references.length ? ` Reference lines: ${references.join('; ')}.` : '');
    return chartLabel(this.description(), summary);
  });

  protected readonly table = computed((): ChartTable => {
    const unit = this.unit();
    const decimals = this.decimals();
    const items = this.items();
    const withNotes = items.some((item) => !!item.note);
    const cells = (label: string, value: string, note = '') =>
      withNotes ? [label, value, note] : [label, value];
    return {
      caption: this.title() ?? 'Bar chart data',
      columns: cells('Category', unit ? `Value (${unit})` : 'Value', 'Note'),
      rows: [
        ...items.map((item) => cells(item.label, formatNumber(item.value, decimals), item.note)),
        ...this.thresholds().map((line) =>
          cells(
            `${line.label} (reference line)`,
            `${line.symmetric ? '±' : ''}${formatNumber(line.value, decimals)}`,
          ),
        ),
      ],
    };
  });
}
