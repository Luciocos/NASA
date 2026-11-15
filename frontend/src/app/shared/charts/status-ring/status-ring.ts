import { Component, computed, input } from '@angular/core';

import { CriterionStatus } from '../../../core/models';
import { chartLabel, countLabel } from '../kit/a11y';
import { ChartFrame, ChartTable } from '../kit/chart-frame/chart-frame';
import { injectHostWidth, nextChartId } from '../kit/host-width';
import { polarPoint, ringSegmentPath } from '../kit/paths';
import { ChartTone, StatusRingItem } from '../types';

interface StatusMeta {
  text: string;
  symbol: string;
  tone: ChartTone;
}

/** texto, símbolo y tono de cada estado: el significado nunca queda solo en el color */
export const STATUS_META: Record<CriterionStatus, StatusMeta> = {
  cumple: { text: 'Cumple', symbol: '✓', tone: 'positive' },
  no_cumple: { text: 'No cumple', symbol: '✗', tone: 'negative' },
  sin_dato: { text: 'Sin dato', symbol: '?', tone: 'neutral' },
};

const THICKNESS = 20;

/**
 * anillo de criterios: un tramo por criterio, con trama y símbolo según su estado (cumple
 * liso con ✓, no cumple rayado con ✗, sin dato con trama gris y ?). al lado va la lista
 * con el nombre y el estado de cada uno, y en el centro la cuenta o `centerLabel`
 *
 * @example
 * <app-status-ring
 *   title="Criterios del puntaje"
 *   [items]="[
 *     { label: 'Sin cambio de uso desde 2020', status: 'cumple' },
 *     { label: 'Cobertura invernal', status: 'sin_dato' },
 *   ]"
 * />
 */
@Component({
  selector: 'app-status-ring',
  imports: [ChartFrame],
  styleUrls: ['../kit/kit.css', './status-ring.css'],
  templateUrl: './status-ring.html',
  host: { '[attr.title]': 'null' },
})
export class StatusRing {
  readonly items = input<readonly StatusRingItem[]>([]);
  /** texto del centro. por defecto la cuenta de criterios que cumplen ("3 de 5") */
  readonly centerLabel = input<string>();
  readonly title = input<string>();
  readonly description = input<string>();
  readonly emptyText = input('Sin criterios para mostrar');

  protected readonly uid = nextChartId('ring');
  private readonly width = injectHostWidth();

  protected readonly empty = computed(() => this.items().length === 0);

  protected readonly view = computed(() => {
    const items = this.items();
    const stacked = this.width() < 420;
    const size = stacked ? 132 : 150;
    const c = size / 2;
    const outer = c - 2;
    const inner = outer - THICKNESS;
    const per = 360 / Math.max(1, items.length);
    const gap = items.length > 1 ? 4 : 0;
    const middle = (outer + inner) / 2;
    // el símbolo va sobre el tramo solo si entra en su arco
    const showSymbols = (2 * Math.PI * middle) / Math.max(1, items.length) >= 22;
    const segments = items.map((item, index) => {
      const meta = STATUS_META[item.status] ?? STATUS_META.sin_dato;
      const start = index * per + gap / 2;
      const end = (index + 1) * per - gap / 2;
      const [x, y] = polarPoint(c, c, middle, (start + end) / 2);
      const fill =
        item.status === 'no_cumple'
          ? `url(#${this.uid}-no)`
          : item.status === 'cumple'
            ? null
            : `url(#${this.uid}-nodata)`;
      return {
        key: index,
        status: item.status,
        tone: meta.tone,
        symbol: meta.symbol,
        fill,
        d: ringSegmentPath(c, c, outer, inner, start, end),
        x,
        y,
      };
    });
    const met = items.filter((item) => item.status === 'cumple').length;
    const custom = this.centerLabel();
    return {
      size,
      stacked,
      c,
      segments,
      showSymbols,
      center: custom || `${met} de ${items.length}`,
      caption: custom ? null : 'cumplen',
    };
  });

  protected readonly list = computed(() =>
    this.items().map((item, index) => ({
      key: index,
      label: item.label,
      ...(STATUS_META[item.status] ?? STATUS_META.sin_dato),
      status: item.status,
    })),
  );

  protected readonly label = computed(() => {
    const items = this.items();
    const count = (status: CriterionStatus) =>
      items.filter((item) => item.status === status).length;
    const detail = items
      .map(
        (item) =>
          `${item.label}: ${(STATUS_META[item.status] ?? STATUS_META.sin_dato).text.toLowerCase()}`,
      )
      .join('; ');
    const summary =
      `Anillo de ${countLabel(items.length, 'criterio', 'criterios')}: ` +
      `${countLabel(count('cumple'), 'cumple', 'cumplen')}, ` +
      `${countLabel(count('no_cumple'), 'no cumple', 'no cumplen')} y ${count('sin_dato')} sin dato. ${detail}.`;
    return chartLabel(this.description(), summary);
  });

  protected readonly table = computed((): ChartTable => ({
    caption: this.title() ?? 'Criterios',
    columns: ['Criterio', 'Estado'],
    rows: this.items().map((item) => [
      item.label,
      (STATUS_META[item.status] ?? STATUS_META.sin_dato).text,
    ]),
  }));
}
