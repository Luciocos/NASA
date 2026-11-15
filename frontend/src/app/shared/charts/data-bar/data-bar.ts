import { Component, computed, input } from '@angular/core';

import { NO_DATA, formatNumber, formatPercent, formatValue } from '../format';
import { chartLabel } from '../kit/a11y';
import { ChartFrame, ChartTable } from '../kit/chart-frame/chart-frame';
import { injectHostWidth, nextChartId } from '../kit/host-width';
import { segmentPath } from '../kit/paths';
import { FONT_SIZE } from '../kit/rows';
import { estimateTextWidth, wrapText } from '../kit/text';
import { noDataFill, textureFill } from '../kit/tones';
import { ChartTone } from '../types';

const TRACK_Y = 20;
const TRACK_HEIGHT = 10;

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * barra de un solo dato contra su máximo, para filas de indicadores. sin valor, o sin un
 * máximo válido, muestra la pista con trama y "Sin dato" con el motivo, si se informa
 *
 * @example
 * <app-data-bar label="NDVI medio" [value]="0.62" [max]="1" [decimals]="2" tone="verified" />
 * <app-data-bar label="Humedad del suelo" [value]="null" reason="sin pasada de SMAP" />
 */
@Component({
  selector: 'app-data-bar',
  imports: [ChartFrame],
  styleUrls: ['../kit/kit.css', './data-bar.css'],
  templateUrl: './data-bar.html',
  host: { '[attr.title]': 'null' },
})
export class DataBar {
  readonly value = input<number | null>(null);
  readonly max = input(1);
  /** rótulo a la izquierda, arriba de la barra */
  readonly label = input<string>();
  readonly tone = input<ChartTone>('neutral');
  readonly unit = input('');
  readonly decimals = input(1);
  /** motivo del faltante ("nubes en todas las pasadas"): acompaña al "Sin dato" */
  readonly reason = input<string>();
  /** tabla equivalente en "Ver datos". se puede apagar en listas donde el valor ya se lee */
  readonly showTable = input(true);
  readonly title = input<string>();
  readonly description = input<string>();

  protected readonly uid = nextChartId('databar');
  private readonly width = injectHostWidth();

  private readonly known = computed(() => {
    const value = this.value();
    const max = this.max();
    return isNumber(value) && isNumber(max) && max > 0 ? { value, max } : null;
  });

  private readonly valueText = computed(() => {
    const known = this.known();
    if (!known) {
      const reason = this.reason();
      const why = reason || (isNumber(this.value()) ? 'no reference maximum' : '');
      return why ? `${NO_DATA} · ${why}` : NO_DATA;
    }
    return formatValue(known.value, this.unit(), this.decimals());
  });

  protected readonly view = computed(() => {
    const width = this.width();
    const known = this.known();
    const tone = this.tone();
    const text = this.valueText();
    const textWidth = estimateTextWidth(text, FONT_SIZE, true);
    const label = this.label();
    const labelText = label
      ? wrapText(label, Math.max(40, width - textWidth - 14), FONT_SIZE, 1)[0]
      : null;
    const ratio = known ? Math.min(1, Math.max(0, known.value / known.max)) : 0;
    const fillWidth = ratio > 0 ? Math.max(4, ratio * width) : 0;
    return {
      width,
      height: TRACK_Y + TRACK_HEIGHT,
      labelText,
      text,
      tone,
      fill: textureFill(this.uid, tone),
      bar: known && fillWidth > 0 ? segmentPath(0, TRACK_Y, fillWidth, TRACK_HEIGHT, 5, 5) : null,
      missing: !known,
      noData: noDataFill(this.uid),
    };
  });

  protected readonly ariaLabel = computed(() => {
    const known = this.known();
    const name = this.label() ?? this.title() ?? 'Value';
    const summary = known
      ? `${name}: ${formatValue(known.value, this.unit(), this.decimals())} out of a maximum of ` +
        `${formatValue(known.max, this.unit(), this.decimals())} (${formatPercent(known.value / known.max)}).`
      : `${name}: ${this.valueText()}.`;
    return chartLabel(this.description(), summary);
  });

  protected readonly table = computed((): ChartTable | null => {
    if (!this.showTable()) {
      return null;
    }
    const unit = this.unit();
    const known = this.known();
    return {
      caption: this.title() ?? this.label() ?? 'Value',
      columns: ['Item', unit ? `Value (${unit})` : 'Value', 'Maximum', 'Share'],
      rows: [
        [
          this.label() ?? this.title() ?? 'Value',
          known ? formatNumber(known.value, this.decimals()) : this.valueText(),
          formatNumber(isNumber(this.max()) ? this.max() : null, this.decimals()),
          known ? formatPercent(known.value / known.max) : NO_DATA,
        ],
      ],
    };
  });
}
