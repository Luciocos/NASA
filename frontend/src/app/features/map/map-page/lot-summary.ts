import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatHectares, latestCampaign } from '../../../core/insights';
import { LotOverview } from '../../../core/lot-scene';
import { NdviObservation } from '../../../core/nasa';
import { EventGlyph } from '../../../shared/iso/event-glyph';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Icon } from '../../../shared/ui/icon/icon';
import { formatDate } from '../../lot/labels';

let nextId = 0;

/**
 * resumen del lote elegido en Mi campo: dónde está, su cultivo y su último evento, cada dato con
 * su origen. una sola acción: "Ver lote"
 */
@Component({
  selector: 'app-lot-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EventGlyph, OriginBadge, SimulatedNotice, Icon],
  host: { role: 'region', '[attr.aria-labelledby]': 'headingId' },
  template: `
    @let lot = overview().lot;
    <header class="head">
      <div class="titles">
        <h2 [id]="headingId">{{ lot.name }}</h2>
        <p class="where">
          {{ lot.locality || 'Sin localidad' }} · {{ formatHectares(lot.area_ha) }}
        </p>
      </div>
      <button type="button" class="btn btn--ghost btn--icon btn--sm" (click)="closed.emit()">
        <app-icon name="close" /><span class="visually-hidden">Cerrar resumen</span>
      </button>
    </header>

    <dl class="facts">
      <div>
        <dt>Cultivo</dt>
        <dd>
          @if (campaign(); as current) {
            <strong>{{ current.crop_label }}</strong>
            <span class="muted">campaña {{ current.label }}</span>
            <app-origin-badge [origin]="current.crop_origin" />
          } @else {
            <span class="muted">Sin campañas registradas</span>
          }
        </dd>
      </div>
      <div>
        <dt>Último evento</dt>
        <dd>
          @if (overview().last; as event) {
            <span class="event"><app-event-glyph [type]="event.type" />{{ event.type_label }}</span>
            <span class="muted">{{ formatDate(event.date) }} · {{ event.sensor_label }}</span>
            <app-origin-badge [origin]="event.origin" />
            @if (event.is_simulated) {
              <app-simulated-notice />
            }
          } @else {
            <span class="muted">
              Todavía no hay eventos detectados. Los datos de la NASA de su polígono se consultan en
              vivo en la ficha.
            </span>
          }
        </dd>
      </div>
      @if (ndvi(); as obs) {
        <div>
          <dt>Verdor actual</dt>
          <dd>
            <strong>{{
              obs.mean === null ? 'Sin dato' : 'NDVI ' + obs.mean.toLocaleString('es-AR')
            }}</strong>
            <span class="muted">
              {{ obs.mean === null ? 'nubes o sin píxeles válidos · ' : '' }}MODIS
              {{ obs.satellite }}, compuesto del {{ formatDate(obs.date) }}
            </span>
            <app-origin-badge origin="VERIFIED" />
          </dd>
        </div>
      }
    </dl>

    <a class="btn btn--block" [routerLink]="['/lotes', lot.id]">
      Ver lote <app-icon name="arrow-right" />
    </a>
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
    h2,
    dl,
    dd {
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
    .facts {
      display: grid;
      gap: var(--space-3);
    }
    dt {
      margin-bottom: 0.125rem;
      color: var(--ink-3);
      font-size: var(--text-xs);
      font-weight: 600;
    }
    dd {
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
  protected readonly campaign = computed(() => latestCampaign(this.overview().campaigns ?? []));
  protected readonly formatHectares = formatHectares;
  protected readonly formatDate = formatDate;
}
