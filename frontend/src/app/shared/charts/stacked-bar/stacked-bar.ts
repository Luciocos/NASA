import { Component, computed, input } from '@angular/core';

import { NO_DATA, formatNumber, formatPercent, formatValue } from '../format';
import { chartLabel, countLabel } from '../kit/a11y';
import { ChartFrame, ChartTable } from '../kit/chart-frame/chart-frame';
import { injectHostWidth, nextChartId } from '../kit/host-width';
import { segmentPath } from '../kit/paths';
import { noDataFill, textureFill } from '../kit/tones';
import { ChartTone, StackedSegment } from '../types';

interface SegmentView {
  key: string;
  tone: ChartTone;
  fill: string | null;
  d: string;
  hint: string;
}

interface LegendItem {
  key: string;
  label: string;
  tone: ChartTone;
  fill: string | null;
  value: string;
  share: string;
}

const BAR_HEIGHT = 20;
/** separación del color del fondo entre tramos que se tocan */
const GAP = 2;

function amount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * barra apilada que reparte un total entre partes, por ejemplo los orígenes del dato. la
 * trama acompaña al tono de origen (verificado liso, declarado rayado, estimado punteado).
 * un tramo en 0 no se dibuja pero figura en la leyenda con su valor
 *
 * @example
 * <app-stacked-bar
 *   title="Origen de los datos de la huella"
 *   unit="datos"
 *   [segments]="[
 *     { key: 'v', label: 'Verificado', value: 6, tone: 'verified' },
 *     { key: 'd', label: 'Declarado', value: 3, tone: 'declared' },
 *     { key: 'e', label: 'Estimado', value: 2, tone: 'estimated' },
 *   ]"
 * />
 */
@Component({
  selector: 'app-stacked-bar',
  imports: [ChartFrame],
  styleUrls: ['../kit/kit.css', './stacked-bar.css'],
  templateUrl: './stacked-bar.html',
  host: { '[attr.title]': 'null' },
})
export class StackedBar {
  readonly segments = input<readonly StackedSegment[]>([]);
  readonly unit = input('');
  readonly decimals = input(0);
  readonly title = input<string>();
  readonly description = input<string>();
  readonly emptyText = input('Sin datos para mostrar');

  protected readonly uid = nextChartId('stack');
  private readonly width = injectHostWidth();

  protected readonly empty = computed(() => this.segments().length === 0);

  private readonly total = computed(() =>
    this.segments().reduce((sum, segment) => sum + amount(segment.value), 0),
  );

  protected readonly view = computed(() => {
    const width = this.width();
    const total = this.total();
    const unit = this.unit();
    const decimals = this.decimals();
    const drawn = this.segments().filter((segment) => amount(segment.value) > 0);
    const room = width - GAP * Math.max(0, drawn.length - 1);
    let x = 0;
    const segments = drawn.map((segment, index): SegmentView => {
      // un tramo distinto de cero siempre queda visible, aunque sea mínimo
      const size = Math.max(2, (amount(segment.value) / total) * room);
      const last = index === drawn.length - 1;
      const view = {
        key: segment.key,
        tone: segment.tone,
        fill: textureFill(this.uid, segment.tone),
        d: segmentPath(
          x,
          0,
          last ? Math.max(2, width - x) : size,
          BAR_HEIGHT,
          index === 0 ? 4 : 0,
          last ? 4 : 0,
        ),
        hint: `${segment.label}: ${formatValue(segment.value, unit, decimals)} (${formatPercent(amount(segment.value) / total)})`,
      };
      x += size + GAP;
      return view;
    });
    return { width, height: BAR_HEIGHT, segments, noData: noDataFill(this.uid) };
  });

  protected readonly legend = computed((): LegendItem[] => {
    const total = this.total();
    const unit = this.unit();
    const decimals = this.decimals();
    return this.segments().map((segment) => ({
      key: segment.key,
      label: segment.label,
      tone: segment.tone,
      fill: textureFill(this.uid, segment.tone),
      value: formatValue(Number.isFinite(segment.value) ? segment.value : null, unit, decimals),
      share: total > 0 ? formatPercent(amount(segment.value) / total) : NO_DATA,
    }));
  });

  protected readonly label = computed(() => {
    const total = this.total();
    const items = this.legend().map((item) => `${item.label}: ${item.value} (${item.share})`);
    const summary =
      total > 0
        ? `Barra apilada de ${countLabel(this.segments().length, 'parte', 'partes')} que suman ` +
          `${formatValue(total, this.unit(), this.decimals())}. ${items.join('; ')}.`
        : `Barra apilada sin valores: ${NO_DATA}.`;
    return chartLabel(this.description(), summary);
  });

  protected readonly table = computed((): ChartTable => {
    const unit = this.unit();
    const legend = this.legend();
    return {
      caption: this.title() ?? 'Datos de la barra apilada',
      columns: ['Parte', unit ? `Valor (${unit})` : 'Valor', 'Porcentaje'],
      rows: this.segments().map((segment, index) => [
        segment.label,
        formatNumber(Number.isFinite(segment.value) ? segment.value : null, this.decimals()),
        legend[index].share,
      ]),
    };
  });
}
