import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { formatHectares } from '../../../core/insights';
import { LotOverview } from '../../../core/lot-scene';
import { NdviObservation } from '../../../core/nasa';
import { EventGlyph } from '../../../shared/iso/event-glyph';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Icon } from '../../../shared/ui/icon/icon';
import { formatDate } from '../../lot/labels';
import { LotLink } from '../../lot/lot-workspace/lot-link';

let nextId = 0;

/**
 * resumen del lote elegido en Mi campo, sin párrafos: el nombre, las hectáreas y una línea de
 * estado con su origen (su último evento o, con la capa NDVI prendida, su verdor actual). una
 * sola acción: "Ver lote", que lo abre en el popup
 */
@Component({
  selector: 'app-lot-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EventGlyph, OriginBadge, SimulatedNotice, Icon, LotLink],
  host: { role: 'region', '[attr.aria-labelledby]': 'headingId' },
  template: `
    @let lot = overview().lot;
    <header class="head">
      <div class="titles">
        <h2 [id]="headingId">{{ lot.name }}</h2>
        <p class="where">
          {{ formatHectares(lot.area_ha) }}{{ lot.locality ? ' · ' + lot.locality : '' }}
        </p>
      </div>
      <button type="button" class="btn btn--ghost btn--icon btn--sm" (click)="closed.emit()">
        <app-icon name="close" /><span class="visually-hidden">Cerrar resumen</span>
      </button>
    </header>

    <p class="status">
      @if (ndvi(); as obs) {
        @if (obs.mean === null) {
          <strong>NDVI sin dato</strong>
          <span class="muted">nubes o sin píxeles válidos</span>
        } @else {
          <strong>NDVI {{ obs.mean.toLocaleString('es-AR') }}</strong>
          <span class="muted">{{ formatDate(obs.date) }}</span>
          <app-origin-badge origin="VERIFIED" />
        }
      } @else if (overview().last; as event) {
        <span class="event"><app-event-glyph [type]="event.type" />{{ event.type_label }}</span>
        <span class="muted">{{ formatDate(event.date) }}</span>
        <app-origin-badge [origin]="event.origin" />
        @if (event.is_simulated) {
          <app-simulated-notice />
        }
      } @else {
        <span class="muted">Sin eventos detectados todavía</span>
      }
    </p>

    <a class="btn btn--block" [appLotLink]="lot.id">Ver lote <app-icon name="arrow-right" /></a>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5) var(--space-5);
      border: 1px solid var(--accent-line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow:
        inset 0 4px 0 var(--accent),
        var(--shadow-2);
    }
    p,
    h2 {
      margin: 0;
    }
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .titles {
      display: grid;
      gap: 0.125rem;
      min-width: 0;
    }
    h2 {
      font-size: var(--text-xl);
      overflow-wrap: anywhere;
    }
    .where {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .status {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.5rem;
      font-size: var(--text-sm);
    }
    .event {
      --glyph-size: 1.25rem;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-weight: 700;
    }
    .event app-event-glyph {
      color: var(--field-700);
    }
  `,
})
export class LotSummary {
  readonly overview = input.required<LotOverview>();
  /** verdor actual del lote, solo mientras la capa está prendida */
  readonly ndvi = input<NdviObservation | null>(null);
  /** la persona cerró el resumen */
  readonly closed = output<void>();

  protected readonly headingId = `lot-summary-${nextId++}`;
  protected readonly formatHectares = formatHectares;
  protected readonly formatDate = formatDate;
}
