import { Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';

import { NO_DATA, formatDate, formatNumber, formatValue } from '../format';
import { chartLabel, countLabel } from '../kit/a11y';
import { ChartFrame, ChartTable } from '../kit/chart-frame/chart-frame';
import { injectHostWidth } from '../kit/host-width';
import { FONT_SIZE, STACK_BELOW } from '../kit/rows';
import { estimateTextWidth } from '../kit/text';
import { TimeAxis, timeAxis } from '../kit/time-axis';
import { SERIES_TONES } from '../kit/tones';
import { LinearScale, isoToDay, linearScale, niceTicks } from '../scale';
import { ChartSeries, ChartTone, SeriesBand, SeriesMarker, SeriesPoint } from '../types';

interface LineView {
  key: string;
  tone: ChartTone;
  dash: string | null;
  paths: string[];
  /** puntos sueltos entre dos faltantes, o la serie de un solo punto */
  dots: { key: string; x: number; y: number; r: number }[];
}

interface MarkerView {
  key: string;
  x: number;
  label: string | null;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'end';
}

interface BandView {
  y: number;
  height: number;
  label: string;
  labelY: number;
}

interface CursorStop {
  date: string;
  x: number;
  /** por serie: el punto de esa fecha, si la serie tiene uno */
  points: (SeriesPoint | null)[];
  ys: (number | null)[];
}

interface SeriesView {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  axis: TimeAxis;
  yTicks: { key: string; y: number; label: string }[];
  yTitle: string | null;
  lines: LineView[];
  values: { key: string; x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }[];
  gaps: { key: string; x: number; width: number }[];
  markers: MarkerView[];
  band: BandView | null;
  stops: CursorStop[];
  /** ninguna fecha tiene valor: el dibujo lo dice en vez de mostrar un eje vacío */
  allMissing: boolean;
}

interface NormalizedSeries {
  name: string;
  tone: ChartTone;
  dash: string | null;
  points: SeriesPoint[];
}

/** con más fechas que esto no se rotula cada valor: se usa el cursor */
export const MAX_LABELED_POINTS = 16;
/** trazo de cada serie por orden fijo: la identidad no depende solo del color */
const DASHES: readonly (string | null)[] = [null, '6 3', '2 3', '8 3 2 3'];
const TOP_ROW = 16;

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalize(series: readonly ChartSeries[]): NormalizedSeries[] {
  return series.map((item, index) => ({
    name: item.name,
    tone: item.tone ?? SERIES_TONES[index] ?? 'neutral',
    dash: DASHES[index] ?? null,
    points: item.points
      .filter((point) => Number.isFinite(isoToDay(point.date)))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  }));
}

function unionDates(series: readonly NormalizedSeries[]): string[] {
  return [...new Set(series.flatMap((item) => item.points.map((point) => point.date)))].sort();
}

function pointAt(series: NormalizedSeries, date: string): SeriesPoint | null {
  return series.points.find((point) => point.date === date) ?? null;
}

/** índice de la parada más cercana a una x, por búsqueda binaria */
export function nearestIndex(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.abs(xs[hi] - x) < Math.abs(xs[lo] - x) ? hi : lo;
}

function placeMarkers(
  markers: readonly SeriesMarker[],
  x: (iso: string) => number,
  width: number,
): { views: Omit<MarkerView, 'labelY'>[]; rows: number[]; count: number } {
  const taken: { from: number; to: number; row: number }[] = [];
  const rows: number[] = [];
  let count = 0;
  const sorted = markers
    .filter((marker) => Number.isFinite(isoToDay(marker.date)))
    .map((marker, index) => ({ marker, index, x: x(marker.date) }))
    .sort((a, b) => a.x - b.x);
  const views = sorted.map(({ marker, index, x: at }) => {
    const textWidth = estimateTextWidth(marker.label, FONT_SIZE);
    for (let row = 0; row < 3; row++) {
      for (const side of ['start', 'end'] as const) {
        const from = side === 'start' ? at + 4 : at - 4 - textWidth;
        const to = from + textWidth;
        const free = !taken.some(
          (slot) => slot.row === row && from < slot.to + 8 && to > slot.from - 8,
        );
        if (from >= 0 && to <= width && free) {
          taken.push({ from, to, row });
          rows.push(row);
          count = Math.max(count, row + 1);
          return {
            key: `${index}`,
            x: at,
            label: marker.label,
            labelX: side === 'start' ? at + 4 : at - 4,
            anchor: side,
          };
        }
      }
    }
    // sin lugar para el rótulo: queda la línea, el texto sigue en la tabla y el aria-label
    rows.push(-1);
    return { key: `${index}`, x: at, label: null, labelX: at, anchor: 'start' as const };
  });
  return { views, rows, count };
}

function buildView(
  series: readonly NormalizedSeries[],
  unit: string,
  decimals: number,
  yDomain: readonly [number, number] | undefined,
  yLabel: string | undefined,
  markers: readonly SeriesMarker[],
  band: SeriesBand | undefined,
  width: number,
): SeriesView {
  const dates = unionDates(series);
  const values = series.flatMap((item) => item.points.map((point) => point.value)).filter(isNumber);
  const range = band && isNumber(band.from) && isNumber(band.to) ? band : null;
  // baja: la pestaña Satélite entra en el popup sin desplazar en la compu y con poco en el celular
  const plotHeight = width < STACK_BELOW ? 130 : 180;

  const fixed =
    yDomain && isNumber(yDomain[0]) && isNumber(yDomain[1]) && yDomain[0] !== yDomain[1]
      ? ([Math.min(yDomain[0], yDomain[1]), Math.max(yDomain[0], yDomain[1])] as [number, number])
      : null;
  const extent = [...values, ...(range ? [range.from, range.to] : [])];
  const nice = fixed
    ? niceTicks(fixed[0], fixed[1], 5)
    : niceTicks(Math.min(...extent, Infinity), Math.max(...extent, -Infinity), 5);
  const domain: [number, number] = fixed ?? nice.domain;
  const tickValues = nice.values.filter(
    (value) => value >= domain[0] - 1e-9 && value <= domain[1] + 1e-9,
  );
  const tickLabels = tickValues.map((value) => formatNumber(value, nice.decimals));
  const left = Math.max(
    28,
    Math.ceil(Math.max(...tickLabels.map((t) => estimateTextWidth(t, FONT_SIZE)))) + 10,
  );
  const right = width - 8;

  const markerDays = markers.map((marker) => isoToDay(marker.date)).filter(Number.isFinite);
  const days = [...dates.map(isoToDay), ...markerDays];
  const xScale = linearScale([Math.min(...days), Math.max(...days)], [left, right]);
  const x = (iso: string) => xScale(isoToDay(iso));

  const title = yLabel ?? (unit || null);
  const placed = placeMarkers(markers, x, width);
  const head = title ? 20 : 8;
  const top = placed.count ? head + placed.count * TOP_ROW + 6 : head + (title ? 6 : 0);
  const bottom = top + plotHeight;
  const yScale: LinearScale = linearScale(domain, [bottom, top], true);

  const lines = series.map((item, s): LineView => {
    const paths: string[] = [];
    const dots: LineView['dots'] = [];
    let run: SeriesPoint[] = [];
    const flush = () => {
      if (run.length === 1) {
        dots.push({
          key: run[0].date,
          x: x(run[0].date),
          y: yScale(run[0].value as number),
          r: item.points.length === 1 ? 4 : 2.5,
        });
      } else if (run.length > 1) {
        paths.push(
          run
            .map(
              (point, i) =>
                `${i ? 'L' : 'M'}${x(point.date).toFixed(1)},${yScale(point.value as number).toFixed(1)}`,
            )
            .join(''),
        );
      }
      run = [];
    };
    for (const point of item.points) {
      if (isNumber(point.value)) {
        run.push(point);
      } else {
        flush();
      }
    }
    flush();
    return { key: `${s}`, tone: item.tone, dash: item.dash, paths, dots };
  });

  // con pocas fechas y una sola serie se rotula cada valor, si entra
  const single = series.length === 1 ? series[0] : null;
  const spacing = dates.length > 1 ? (right - left) / (dates.length - 1) : right - left;
  const widest = Math.max(
    0,
    ...(single?.points ?? []).map((point) =>
      estimateTextWidth(formatNumber(point.value, decimals), FONT_SIZE),
    ),
  );
  const labelValues =
    single !== null &&
    dates.length <= MAX_LABELED_POINTS &&
    (dates.length === 1 || widest + 6 <= spacing);
  const valueLabels =
    labelValues && single
      ? single.points
          .filter((point) => isNumber(point.value))
          .map((point) => {
            const text = formatNumber(point.value, decimals);
            const at = x(point.date);
            const half = estimateTextWidth(text, FONT_SIZE, true) / 2;
            // en los bordes el rótulo se corre hacia adentro para no salirse del dibujo
            const anchor: 'start' | 'middle' | 'end' =
              at + half > width ? 'end' : at - half < left - 6 ? 'start' : 'middle';
            return {
              key: point.date,
              x: anchor === 'end' ? at + 4 : anchor === 'start' ? at - 4 : at,
              y: Math.max(top + 10, yScale(point.value as number) - 9),
              text,
              anchor,
            };
          })
      : [];

  // tramos de fechas sin dato, a lo largo del eje: el hueco de la línea queda explicado
  const gapWidth = Math.min(10, Math.max(3, spacing * 0.7));
  const gaps: SeriesView['gaps'] = [];
  let runStart: number | null = null;
  dates.forEach((date, index) => {
    const missing = series.some((item) => {
      const point = pointAt(item, date);
      return point !== null && !isNumber(point.value);
    });
    if (missing && runStart === null) {
      runStart = index;
    }
    const closes = runStart !== null && (!missing || index === dates.length - 1);
    if (closes && runStart !== null) {
      const end = missing ? index : index - 1;
      const from = x(dates[runStart]) - gapWidth / 2;
      gaps.push({ key: dates[runStart], x: from, width: x(dates[end]) + gapWidth / 2 - from });
      runStart = null;
    }
  });

  let bandView: BandView | null = null;
  if (range) {
    const y1 = yScale(Math.max(range.from, range.to));
    const y2 = yScale(Math.min(range.from, range.to));
    const height = Math.max(1, y2 - y1);
    bandView = { y: y1, height, label: range.label, labelY: height >= 18 ? y1 + 13 : y1 - 4 };
  }

  return {
    width,
    height: bottom + 34,
    left,
    right,
    top,
    bottom,
    axis: timeAxis(xScale, width, width < STACK_BELOW ? 56 : 64),
    yTicks: tickValues.map((value, index) => ({
      key: `${value}`,
      y: yScale(value),
      label: tickLabels[index],
    })),
    yTitle: title,
    lines,
    values: valueLabels,
    gaps,
    markers: placed.views.map((view, index) => ({
      ...view,
      labelY: head + Math.max(0, placed.rows[index]) * TOP_ROW + 10,
    })),
    band: bandView,
    stops: dates.map((date) => {
      const points = series.map((item) => pointAt(item, date));
      return {
        date,
        x: x(date),
        points,
        ys: points.map((point) => (point && isNumber(point.value) ? yScale(point.value) : null)),
      };
    }),
    allMissing: values.length === 0,
  };
}

function valueText(point: SeriesPoint | null, unit: string, decimals: number): string {
  if (!point) {
    return 'sin medición en esa fecha';
  }
  const text = formatValue(point.value, unit, decimals);
  return point.label ? `${text} (${point.label})` : text;
}

/**
 * serie temporal en líneas rectas, sin suavizar. un valor null corta la línea y deja el
 * hueco a la vista, con una marca sobre el eje: nunca se interpola. con más de 16 fechas
 * no rotula cada valor y ofrece un cursor que sigue al mouse o a las flechas del teclado
 * (con el foco en el gráfico), con la fecha y el valor de cada serie
 *
 * @example
 * <app-series-chart
 *   title="NDVI del lote (MODIS, cada 16 días)"
 *   yLabel="NDVI"
 *   [yDomain]="[0, 1]"
 *   [series]="[{ name: 'NDVI', tone: 'verified', points: ndvi }]"
 *   [markers]="[{ date: '2026-09-07', label: 'Siembra' }]"
 * />
 */
@Component({
  selector: 'app-series-chart',
  imports: [ChartFrame],
  styleUrls: ['../kit/kit.css', './series-chart.css'],
  templateUrl: './series-chart.html',
  host: { '[attr.title]': 'null' },
})
export class SeriesChart {
  readonly series = input<readonly ChartSeries[]>([]);
  /** unidad de los valores ("°C", "mm"). vacía para índices como el NDVI */
  readonly unit = input('');
  readonly decimals = input(2);
  /** dominio fijo del eje vertical. por defecto sale de los datos */
  readonly yDomain = input<readonly [number, number]>();
  /** rótulo del eje vertical. por defecto la unidad */
  readonly yLabel = input<string>();
  /** líneas verticales rotuladas, por ejemplo eventos de la bitácora */
  readonly markers = input<readonly SeriesMarker[]>([]);
  /** franja horizontal de referencia */
  readonly band = input<SeriesBand>();
  readonly title = input<string>();
  readonly description = input<string>();
  readonly emptyText = input('Sin datos para mostrar');

  private readonly width = injectHostWidth();
  private readonly plot = viewChild<ElementRef<SVGSVGElement>>('plot');
  protected readonly hoverIndex = signal<number | null>(null);
  protected readonly keyIndex = signal<number | null>(null);

  private readonly normalized = computed(() => normalize(this.series()));

  protected readonly empty = computed(() => unionDates(this.normalized()).length === 0);

  protected readonly view = computed(() =>
    buildView(
      this.normalized(),
      this.unit(),
      this.decimals(),
      this.yDomain(),
      this.yLabel(),
      this.markers(),
      this.band(),
      this.width(),
    ),
  );

  protected readonly cursor = computed(() => {
    const index = this.hoverIndex() ?? this.keyIndex();
    const v = this.view();
    const stop = index === null ? undefined : v.stops[index];
    if (!stop) {
      return null;
    }
    const series = this.normalized();
    const lines = series.map((item, s) => {
      const text = valueText(stop.points[s], this.unit(), this.decimals());
      return series.length === 1 ? text : `${item.name}: ${text}`;
    });
    const end = stop.x > v.width / 2;
    return {
      x: stop.x,
      dots: series
        .map((item, s) => ({ key: `${s}`, tone: item.tone, y: stop.ys[s] }))
        .filter((dot): dot is { key: string; tone: ChartTone; y: number } => dot.y !== null),
      title: formatDate(stop.date),
      lines,
      left: (stop.x / v.width) * 100,
      top: (v.top / v.height) * 100,
      end,
    };
  });

  /** lo que anuncia el lector de pantalla al recorrer con las flechas */
  protected readonly liveText = computed(() => {
    const cursor = this.keyIndex() === null ? null : this.cursor();
    return cursor ? `${cursor.title}. ${cursor.lines.join('. ')}` : '';
  });

  protected readonly legend = computed(() => {
    const series = this.normalized();
    const v = this.view();
    return {
      series: series.length > 1 ? series.map((item, s) => ({ key: `${s}`, ...item })) : [],
      band: v.band ? v.band.label : null,
      gaps: v.gaps.length > 0,
    };
  });

  protected readonly label = computed(() => {
    const series = this.normalized();
    const dates = unionDates(series);
    const unit = this.unit();
    const decimals = this.decimals();
    if (dates.length === 0) {
      return chartLabel(this.description(), 'Serie temporal sin datos.');
    }
    const parts = series.map((item) => {
      const valid = item.points.filter((point) => isNumber(point.value));
      const missing = item.points.length - valid.length;
      const missingText = missing ? `; ${countLabel(missing, 'fecha', 'fechas')} sin dato` : '';
      if (valid.length === 0) {
        return `${item.name}: ${NO_DATA} en ninguna fecha${missingText}`;
      }
      const pick = (compare: (a: number, b: number) => boolean) =>
        valid.reduce((best, point) =>
          compare(point.value as number, best.value as number) ? point : best,
        );
      const min = pick((a, b) => a < b);
      const max = pick((a, b) => a > b);
      const last = valid[valid.length - 1];
      const at = (point: SeriesPoint) =>
        `${formatValue(point.value, unit, decimals)} el ${formatDate(point.date)}`;
      return `${item.name}: mínimo ${at(min)}, máximo ${at(max)}, último valor ${at(last)}${missingText}`;
    });
    const band = this.band();
    const markers = this.markers();
    const summary =
      `Serie temporal con ${countLabel(dates.length, 'fecha', 'fechas')}, ` +
      `del ${formatDate(dates[0])} al ${formatDate(dates[dates.length - 1])}. ${parts.join('. ')}.` +
      (band && isNumber(band.from) && isNumber(band.to)
        ? ` Franja de referencia ${band.label}: de ${formatValue(band.from, unit, decimals)} a ${formatValue(band.to, unit, decimals)}.`
        : '') +
      (markers.length
        ? ` Marcas: ${markers.map((marker) => `${marker.label} el ${formatDate(marker.date)}`).join('; ')}.`
        : '') +
      ' Con el foco en el gráfico, las flechas recorren las fechas.';
    return chartLabel(this.description(), summary);
  });

  protected readonly table = computed((): ChartTable => {
    const series = this.normalized();
    const unit = this.unit();
    const decimals = this.decimals();
    const markers = this.markers().filter((marker) => Number.isFinite(isoToDay(marker.date)));
    const dates = [
      ...new Set([...unionDates(series), ...markers.map((marker) => marker.date)]),
    ].sort();
    const columns = [
      'Fecha',
      ...series.map((item) => (unit ? `${item.name} (${unit})` : item.name)),
    ];
    if (markers.length) {
      columns.push('Marca');
    }
    return {
      caption: this.title() ?? 'Datos de la serie temporal',
      columns,
      rows: dates.map((date) => {
        const row = [
          formatDate(date),
          ...series.map((item) => {
            const point = pointAt(item, date);
            if (!point) {
              return '—';
            }
            const text = formatNumber(point.value, decimals);
            return point.label ? `${text} (${point.label})` : text;
          }),
        ];
        if (markers.length) {
          row.push(
            markers
              .filter((marker) => marker.date === date)
              .map((marker) => marker.label)
              .join(', '),
          );
        }
        return row;
      }),
    };
  });

  protected onPointer(event: MouseEvent): void {
    const svg = this.plot()?.nativeElement;
    const v = this.view();
    if (!svg || v.stops.length === 0) {
      return;
    }
    const rect = svg.getBoundingClientRect();
    const factor = rect.width > 0 ? v.width / rect.width : 1;
    const x = (event.clientX - rect.left) * factor;
    this.hoverIndex.set(
      nearestIndex(
        v.stops.map((stop) => stop.x),
        x,
      ),
    );
  }

  protected onFocus(): void {
    if (this.keyIndex() === null) {
      this.keyIndex.set(this.view().stops.length - 1);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const last = this.view().stops.length - 1;
    const current = this.keyIndex() ?? last;
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowUp: current + 1,
      ArrowLeft: current - 1,
      ArrowDown: current - 1,
      PageUp: current + 10,
      PageDown: current - 10,
      Home: 0,
      End: last,
    };
    if (event.key === 'Escape') {
      this.keyIndex.set(null);
      return;
    }
    const next = moves[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    this.hoverIndex.set(null);
    this.keyIndex.set(Math.min(last, Math.max(0, next)));
  }
}
