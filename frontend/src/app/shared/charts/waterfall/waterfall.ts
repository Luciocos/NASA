import { Component, computed, input } from '@angular/core';

import { formatNumber, formatSigned, formatValue, withUnit } from '../format';
import { chartLabel, countLabel } from '../kit/a11y';
import { ChartFrame, ChartTable } from '../kit/chart-frame/chart-frame';
import { injectHostWidth } from '../kit/host-width';
import { arrowPath, barPath } from '../kit/paths';
import { BAR_HEIGHT, EndLabel, FONT_SIZE, fitScale, layoutRows } from '../kit/rows';
import { estimateTextWidth } from '../kit/text';
import { niceTicks } from '../scale';
import { ChartTone, WaterfallStep } from '../types';

interface Span {
  from: number;
  to: number;
}

interface RowView {
  key: number;
  labelLines: { text: string; y: number }[];
  tone: ChartTone;
  final: boolean;
  back: boolean;
  d: string | null;
  valueText: string;
  valueX: number;
  valueY: number;
  anchor: 'start' | 'end';
  hint: string;
}

const VALUE_GAP = 6;

/** inicio y fin de cada paso: el total sale de cero, la variación del acumulado anterior */
export function waterfallSpans(steps: readonly WaterfallStep[]): Span[] {
  let running = 0;
  return steps.map((step) => {
    const value = Number.isFinite(step.value) ? step.value : 0;
    if (step.kind === 'total') {
      running = value;
      return { from: 0, to: value };
    }
    const from = running;
    running += value;
    return { from, to: running };
  });
}

function stepText(step: WaterfallStep, unit: string, decimals: number): string {
  return step.kind === 'delta'
    ? withUnit(formatSigned(step.value, decimals), unit)
    : formatValue(step.value, unit, decimals);
}

/**
 * cascada de rentabilidad en filas: los totales van desde cero y cada variación sube o baja
 * desde el acumulado, con color, signo y punta de flecha hacia donde va. los conectores
 * unen cada paso con el siguiente y el último total queda destacado
 *
 * @example
 * <app-waterfall
 *   title="Margen por hectárea"
 *   unit="USD/ha"
 *   [steps]="[
 *     { label: 'Ingreso bruto', value: 1150, kind: 'total' },
 *     { label: 'Fertilizantes', value: -180, kind: 'delta' },
 *     { label: 'Margen bruto', value: 970, kind: 'total' },
 *   ]"
 * />
 */
@Component({
  selector: 'app-waterfall',
  imports: [ChartFrame],
  styleUrls: ['../kit/kit.css', './waterfall.css'],
  templateUrl: './waterfall.html',
  host: { '[attr.title]': 'null' },
})
export class WaterfallChart {
  readonly steps = input<readonly WaterfallStep[]>([]);
  readonly unit = input('');
  readonly decimals = input(0);
  readonly title = input<string>();
  readonly description = input<string>();
  readonly emptyText = input('Sin datos para mostrar');

  private readonly width = injectHostWidth();

  protected readonly empty = computed(() => this.steps().length === 0);

  protected readonly view = computed(() => {
    const steps = this.steps();
    const unit = this.unit();
    const decimals = this.decimals();
    const width = this.width();
    const layout = layoutRows(steps, width);
    const spans = waterfallSpans(steps);
    const lastTotal = steps.map((step) => step.kind).lastIndexOf('total');
    const texts = steps.map((step) => stepText(step, unit, decimals));
    const left = layout.plotLeft + 1;
    const right = width - 1;

    const extent = [0, ...spans.flatMap((span) => [span.from, span.to])];
    const lo = Math.min(...extent);
    const hi = Math.max(...extent);
    // el dominio es el de los datos, sin redondear hacia afuera: en pantallas angostas el
    // redondeo podía duplicar el eje y dejar las variaciones casi invisibles
    const domain: [number, number] = [lo, hi > lo ? hi : lo + 1];
    const nice = niceTicks(lo, hi, Math.min(8, Math.max(2, Math.floor((right - left) / 90))));
    const ends: EndLabel[] = spans.map((span, index) => ({
      value: span.to,
      width: estimateTextWidth(texts[index], FONT_SIZE, true),
      side: span.to < span.from || (span.from === span.to && span.to < 0) ? 'start' : 'end',
    }));
    const scale = fitScale(domain, left, right, ends, VALUE_GAP);
    const top = 2;
    const bottom = top + layout.height;

    const rows = steps.map((step, index): RowView => {
      const box = layout.rows[index];
      const span = spans[index];
      const barY = top + box.barY;
      const x0 = scale(span.from);
      const x1 = scale(span.to);
      const back = x1 < x0;
      const final = index === lastTotal;
      const tone: ChartTone =
        step.kind === 'total' ? 'neutral' : step.value >= 0 ? 'positive' : 'negative';
      let d: string | null = null;
      if (span.from !== span.to) {
        d =
          step.kind === 'total'
            ? barPath(x0, x1, barY, BAR_HEIGHT)
            : arrowPath(x0, x1, barY, BAR_HEIGHT);
      }
      const side = ends[index].side;
      return {
        key: index,
        labelLines: box.labelLines.map((text, line) => ({ text, y: top + box.labelYs[line] })),
        tone,
        final,
        back,
        d,
        valueText: texts[index],
        valueX: side === 'end' ? Math.max(x0, x1) + VALUE_GAP : Math.min(x0, x1) - VALUE_GAP,
        valueY: barY + BAR_HEIGHT / 2 + 4,
        // el rótulo que va hacia el final del eje arranca en el extremo de la barra
        anchor: side === 'end' ? 'start' : 'end',
        hint: `${step.label}: ${texts[index]}`,
      };
    });

    // el conector une el fin de un paso con el inicio del siguiente. si el rótulo va arriba
    // de la barra (pantalla angosta) se omite para no tachar el texto
    const connectors = layout.stacked
      ? []
      : steps.slice(1).flatMap((step, index) => {
          const at = spans[index].to;
          const joins = step.kind === 'delta' || Math.abs(step.value - at) < 1e-9;
          return joins
            ? [
                {
                  key: index,
                  x: scale(at),
                  y1: top + layout.rows[index].barY + BAR_HEIGHT,
                  y2: top + layout.rows[index + 1].barY,
                },
              ]
            : [];
        });

    return {
      width,
      height: bottom + 22,
      top,
      bottom,
      rows,
      connectors,
      zeroX: scale(0),
      tickY: bottom + 16,
      ticks: nice.values
        .filter((value) => value >= domain[0] - 1e-9 && value <= domain[1] + 1e-9)
        .map((value) => ({ x: scale(value), label: formatNumber(value, nice.decimals) })),
    };
  });

  protected readonly label = computed(() => {
    const steps = this.steps();
    const unit = this.unit();
    const decimals = this.decimals();
    const parts = steps.map((step) => `${step.label}: ${stepText(step, unit, decimals)}`);
    const summary = `Cascada de ${countLabel(steps.length, 'paso', 'pasos')}. ${parts.join('; ')}.`;
    return chartLabel(this.description(), summary);
  });

  protected readonly table = computed((): ChartTable => {
    const steps = this.steps();
    const spans = waterfallSpans(steps);
    const decimals = this.decimals();
    const unit = this.unit();
    const suffix = unit ? ` (${unit})` : '';
    return {
      caption: this.title() ?? 'Datos de la cascada',
      columns: ['Concepto', 'Tipo', `Valor${suffix}`, `Acumulado${suffix}`],
      rows: steps.map((step, index) => [
        step.label,
        step.kind === 'total' ? 'Total' : 'Variación',
        step.kind === 'total'
          ? formatNumber(step.value, decimals)
          : formatSigned(step.value, decimals),
        formatNumber(spans[index].to, decimals),
      ]),
    };
  });
}
