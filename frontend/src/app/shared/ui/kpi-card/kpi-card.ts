import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';

/** sentido de la tendencia: decide la flecha */
export type KpiTrend = 'up' | 'down' | 'flat';

/** si la tendencia es buena o mala para el productor: decide el color, nunca es la única señal */
export type KpiTrendTone = 'good' | 'bad' | 'neutral';

const TREND_ICONS: Record<KpiTrend, IconName> = {
  up: 'arrow-up',
  down: 'arrow-down',
  flat: 'arrow-right',
};

let nextId = 0;

/**
 * tarjeta de indicador: rótulo, valor grande con su unidad y una línea con su significado
 *
 * estados:
 * - cargando (`loading`): esqueleto en lugar del valor, con aria-busy
 * - sin dato (`value` null, undefined o ''): muestra `emptyLabel` ("Sin dato") y el motivo
 *   (`emptyReason`). nunca inventa un cero
 *
 * la tendencia lleva flecha y texto (`trendText`): sin texto no se muestra, para que el
 * significado no dependa del color. lo proyectado va al pie de la tarjeta: ahí van
 * app-origin-badge, app-simulated-notice y la fuente (`<span class="source">`)
 *
 * los números se formatean en es-AR; un texto se muestra tal cual
 *
 * @example
 * <app-kpi-card icon="cloud" label="Lluvia" [value]="44" unit="mm"
 *   caption="Llovió 44 mm en los últimos 30 días" trend="up" trendText="Más que el mes pasado">
 *   <app-origin-badge origin="VERIFIED" />
 *   <span class="source">Fuente: NASA POWER</span>
 * </app-kpi-card>
 */
@Component({
  selector: 'app-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    role: 'group',
    '[attr.aria-labelledby]': 'labelId',
    '[attr.aria-busy]': 'loading() ? "true" : null',
  },
  template: `
    <div class="head">
      @if (icon(); as name) {
        <span class="icon-badge"><app-icon [name]="name" /></span>
      }
      <p class="label" [id]="labelId">{{ label() }}</p>
    </div>
    @if (loading()) {
      <span class="skeleton value-skeleton" aria-hidden="true"></span>
      <span class="skeleton caption-skeleton" aria-hidden="true"></span>
      <p class="visually-hidden">Cargando…</p>
    } @else if (empty()) {
      <p class="value value--empty">{{ emptyLabel() }}</p>
      @if (emptyReason(); as reason) {
        <p class="caption">{{ reason }}</p>
      }
    } @else {
      <p class="value">
        <span class="amount">{{ display() }}</span>
        @if (unit(); as unitText) {
          <span class="unit">{{ unitText }}</span>
        }
      </p>
      @if (caption(); as captionText) {
        <p class="caption">{{ captionText }}</p>
      }
      @if (trend() && trendText()) {
        <p class="trend" [attr.data-tone]="trendTone()">
          <app-icon [name]="trendIcon()" />{{ trendText() }}
        </p>
      }
    }
    <div class="foot"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
      padding: var(--space-4) var(--space-5) var(--space-5);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-1);
    }
    p {
      margin: 0;
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 2rem;
    }
    .icon-badge {
      --icon-size: 1.1rem;
      display: grid;
      flex: none;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: var(--radius-sm);
      background: var(--field-50);
      color: var(--field-700);
    }
    .label {
      color: var(--ink-2);
      font-size: var(--text-sm);
      font-weight: 600;
      line-height: 1.3;
    }
    .value {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 0.3em;
      color: var(--ink);
      font-size: var(--text-kpi);
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .unit {
      color: var(--ink-3);
      font-size: var(--text-md);
      font-weight: 600;
      letter-spacing: 0;
    }
    .value--empty {
      color: var(--ink-3);
      font-size: var(--text-lg);
      font-weight: 600;
      letter-spacing: 0;
    }
    .caption {
      color: var(--ink-3);
      font-size: var(--text-sm);
      line-height: 1.4;
    }
    .trend {
      --icon-size: 1rem;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--ink-2);
      font-size: var(--text-sm);
      font-weight: 600;
    }
    .trend[data-tone='good'] {
      color: var(--ok);
    }
    .trend[data-tone='bad'] {
      color: var(--danger);
    }
    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1) var(--space-2);
      margin-top: auto;
      padding-top: var(--space-1);
    }
    .foot:empty {
      display: none;
    }
    .value-skeleton {
      width: 55%;
      height: 2rem;
    }
    .caption-skeleton {
      width: 80%;
      height: 0.875rem;
    }
    @media (max-width: 40rem) {
      :host {
        padding: var(--space-3) var(--space-4) var(--space-4);
      }
    }
  `,
})
export class KpiCard {
  /** qué mide, en pocas palabras: "Tus hectáreas" */
  readonly label = input.required<string>();
  /** el número o el texto corto a mostrar. null, undefined o '' es "sin dato" */
  readonly value = input<string | number | null | undefined>(null);
  /** unidad al lado del valor: "ha", "mm", "kg CO2e/t" */
  readonly unit = input<string | null>(null);
  /** una línea con el significado: "Llovió 44 mm en los últimos 30 días" */
  readonly caption = input<string | null>(null);
  /** ícono opcional junto al rótulo */
  readonly icon = input<IconName | null>(null);
  /** flecha de tendencia. se muestra solo con trendText */
  readonly trend = input<KpiTrend | null>(null);
  readonly trendText = input<string | null>(null);
  readonly trendTone = input<KpiTrendTone>('neutral');
  /** mientras carga muestra un esqueleto en lugar del valor */
  readonly loading = input(false, { transform: booleanAttribute });
  /** texto del estado sin dato */
  readonly emptyLabel = input('Sin dato');
  /** por qué no hay dato: "Nubes en todas las pasadas del mes" */
  readonly emptyReason = input<string | null>(null);

  protected readonly labelId = `kpi-label-${nextId++}`;
  protected readonly empty = computed(() => {
    const value = this.value();
    return value === null || value === undefined || value === '';
  });
  protected readonly display = computed(() => {
    const value = this.value();
    return typeof value === 'number' ? value.toLocaleString('es-AR') : (value ?? '');
  });
  protected readonly trendIcon = computed(() => TREND_ICONS[this.trend() ?? 'flat']);
}
