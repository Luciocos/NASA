import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { LotDetail } from '../../../core/models';
import { TerritorialCheck } from '../territory.types';

type OtbnCategory = 'I' | 'II' | 'III';

interface Overlap {
  ha: number;
  pct: number;
}

interface LandUseChangeEvent {
  id: number;
  date: string;
  sensor: string;
  origin: string;
  is_simulated: boolean;
}

/** Forma de `details` del chequeo 'otbn'. Ver backend/territory/checks/otbn.py. */
interface OtbnDetails {
  lot_area_ha?: number;
  overlap?: Partial<Record<OtbnCategory, Overlap>>;
  nearest_protected_m?: number | null;
  nearest_protected_category?: OtbnCategory | null;
  land_use_change_detected?: boolean;
  land_use_change_events?: LandUseChangeEvent[];
  land_use_change_declared?: boolean | null;
  strong_alert?: boolean;
}

const CATEGORIES: { key: OtbnCategory; name: string; color: string; meaning: string }[] = [
  {
    key: 'I',
    name: 'I · Red',
    color: '#b91c1c',
    meaning: 'Very high value: cannot be cleared',
  },
  {
    key: 'II',
    name: 'II · Yellow',
    color: '#ca8a04',
    meaning: 'Medium value: cannot be cleared, allows sustainable use',
  },
  {
    key: 'III',
    name: 'III · Green',
    color: '#15803d',
    meaning: 'Low value (not used in Santa Fe)',
  },
];

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const KM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** Detalle propio del chequeo 'otbn' dentro del panel de chequeos territoriales. */
@Component({
  selector: 'app-otbn-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (details(); as d) {
      @if (d.strong_alert) {
        <div class="alert" role="alert">
          <strong>Warning: possible clearing.</strong>
          The field overlaps protected native forest (category I or II) and
          @if (d.land_use_change_detected) {
            the field log records a land-use change
            @for (e of d.land_use_change_events ?? []; track e.id; let last = $last) {
              ({{ e.date }}, {{ e.sensor
              }}{{ e.is_simulated ? ', simulated data for the demo' : '' }}){{ last ? '' : ',' }}
            }
            @if (d.land_use_change_declared) {
              and
            }
          }
          @if (d.land_use_change_declared) {
            the farmer declared a land-use change since 2020
          }
          . It is worth reviewing it with the provincial forestry authority.
        </div>
      }

      @if (d.overlap) {
        <table class="table">
          <caption>
            Field area in each OTBN category
          </caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" class="num">ha</th>
              <th scope="col" class="num">% of field</th>
            </tr>
          </thead>
          <tbody>
            @for (c of categories; track c.key) {
              <tr>
                <th scope="row">
                  <span class="swatch" [style.background]="c.color" aria-hidden="true"></span>
                  {{ c.name }}
                  <span class="meaning">{{ c.meaning }}</span>
                </th>
                <td class="num">{{ fmt(d.overlap[c.key]?.ha ?? 0) }}</td>
                <td class="num">{{ fmt(d.overlap[c.key]?.pct ?? 0) }} %</td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (nearestKm(); as km) {
        <p class="note">
          Nearest protected forest polygon: {{ km }} km away (category
          {{ d.nearest_protected_category }}).
        </p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .alert {
      margin: 0.5rem 0;
      padding: 0.6rem 0.75rem;
      border: 2px solid #b91c1c;
      border-radius: 6px;
      background: #fef2f2;
      color: #7f1d1d;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    caption {
      text-align: left;
      font-size: 0.8rem;
      color: var(--ink-2, #555);
      padding-bottom: 0.25rem;
    }
    th,
    td {
      padding: 0.3rem 0.4rem;
      border-bottom: 1px solid var(--line, #ddd);
      text-align: left;
      vertical-align: top;
    }
    tbody th {
      font-weight: 600;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .swatch {
      display: inline-block;
      width: 0.7rem;
      height: 0.7rem;
      margin-right: 0.3rem;
      border-radius: 2px;
      vertical-align: middle;
    }
    .meaning {
      display: block;
      font-weight: 400;
      font-size: 0.75rem;
      color: var(--ink-2, #666);
    }
    .note {
      margin: 0.5rem 0 0;
      font-size: 0.8rem;
      color: var(--ink-2, #555);
    }
  `,
})
export class OtbnDetail {
  readonly check = input.required<TerritorialCheck>();
  readonly lot = input.required<LotDetail>();
  /** true si el usuario es dueño del lote y puede declarar. */
  readonly editable = input(false);

  protected readonly categories = CATEGORIES;

  protected readonly details = computed<OtbnDetails | null>(() => {
    const check = this.check();
    return check.status === 'NO_DATA' ? null : (check.details as OtbnDetails);
  });

  /** Distancia en km solo si no hay superposición (si la hay, es 0 y no aporta). */
  protected readonly nearestKm = computed<string | null>(() => {
    const m = this.details()?.nearest_protected_m;
    return m ? KM.format(m / 1000) : null;
  });

  protected fmt(value: number): string {
    return NUMBER.format(value);
  }
}
