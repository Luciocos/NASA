import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { countByOrigin, formatHectares, lastEvent, latestCampaign } from '../../../core/insights';
import { buildIsoScene } from '../../../core/lot-scene';
import { EventLogItem, LotDetail, ORIGIN_LABELS, Origin } from '../../../core/models';
import { EventGlyph } from '../../../shared/iso/event-glyph';
import { IsoScene } from '../../../shared/iso/iso-scene';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { formatEventDate } from '../labels';

const ORIGINS: Origin[] = ['VERIFIED', 'DECLARED', 'ESTIMATED'];

/** encabezado de la ficha: la maqueta del lote, sus datos básicos y su último evento */
@Component({
  selector: 'app-lot-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IsoScene, EventGlyph, OriginBadge, SimulatedNotice],
  template: `
    @let l = lot();
    <section class="hero" [attr.aria-labelledby]="'lot-title-' + l.id">
      <app-iso-scene
        class="hero__scene"
        [lots]="scene()"
        [selectedId]="'' + l.id"
        [interactive]="false"
        [ambient]="true"
        [fitPadding]="56"
        [ariaLabel]="'Maqueta del lote ' + l.name"
      />
      <div class="hero__info">
        <p class="kicker">{{ kicker() }}</p>
        <h1 [id]="'lot-title-' + l.id" style="view-transition-name: lot-hero">{{ l.name }}</h1>
        <dl class="facts">
          <div>
            <dt>Ubicación</dt>
            <dd>{{ l.locality || 'Sin localidad' }}{{ l.province ? ', ' + l.province : '' }}</dd>
          </div>
          <div>
            <dt>Superficie</dt>
            <dd>{{ area() }} <span class="small">(del polígono)</span></dd>
          </div>
          <div>
            <dt>Campaña</dt>
            <dd>
              @if (campaign(); as c) {
                {{ c.label }} · {{ c.crop_label }} <app-origin-badge [origin]="c.crop_origin" />
              } @else {
                Sin campañas
              }
            </dd>
          </div>
          @if (l.renspa) {
            <div>
              <dt>RENSPA</dt>
              <dd>{{ l.renspa }}</dd>
            </div>
          }
        </dl>

        @if (last(); as e) {
          <div class="last">
            <app-event-glyph [type]="e.type" />
            <div>
              <span class="small">Último evento registrado</span>
              <strong>{{ e.type_label }} · {{ eventDate() }}</strong>
              <span class="small">{{ e.sensor_label }}</span>
            </div>
            <app-origin-badge [origin]="e.origin" />
          </div>
          @if (e.is_simulated) {
            <app-simulated-notice />
          }
        } @else {
          <p class="small muted">
            La bitácora todavía no tiene eventos detectados. Abajo están los datos de la NASA de
            este polígono, consultados en vivo.
          </p>
        }

        <!-- el rótulo aclara que se cuentan eventos, no el origen del cultivo de arriba -->
        <div class="origins-row">
          <span class="origins-label">Eventos de la bitácora:</span>
          <ul class="origins" aria-label="Eventos de la bitácora según su origen">
            @for (origin of origins; track origin) {
              <li>
                <strong>{{ counts()[origin] }}</strong> {{ originLabels[origin].toLowerCase()
                }}{{ counts()[origin] === 1 ? '' : 's' }}
              </li>
            }
          </ul>
        </div>
        <ng-content />
      </div>
    </section>
  `,
  styles: `
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      gap: var(--space-5);
      align-items: stretch;
      margin-bottom: var(--space-5);
    }
    .hero__scene {
      min-height: 19rem;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-2);
    }
    .hero__info {
      display: grid;
      gap: var(--space-3);
      align-content: start;
    }
    .kicker {
      margin: 0;
      color: var(--field-700);
      font-size: var(--text-xs);
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
    }
    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-5);
      margin: 0;
    }
    dt {
      color: var(--ink-3);
      font-size: var(--text-xs);
      text-transform: uppercase;
    }
    dd {
      margin: 0;
      font-weight: 600;
    }
    .small {
      color: var(--ink-3);
      font-size: var(--text-xs);
      font-weight: 400;
    }
    .last {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--surface);
      box-shadow: var(--shadow-1);
      --glyph-size: 2rem;
    }
    .last div {
      display: grid;
      flex: 1;
    }
    .origins-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .origins-label {
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .origins {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--text-sm);
    }
    .origins li {
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-pill);
      background: var(--paper-2);
    }
    .muted {
      margin: 0;
    }
    @media (max-width: 56rem) {
      .hero {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class LotHero {
  readonly lot = input.required<LotDetail>();
  readonly events = input<readonly EventLogItem[]>([]);
  readonly owned = input(false);

  protected readonly origins = ORIGINS;
  protected readonly originLabels = ORIGIN_LABELS;
  protected readonly kicker = computed(() =>
    this.owned()
      ? 'Tu lote'
      : this.lot().is_example
        ? 'Lote de ejemplo de la zona'
        : 'Lote compartido',
  );
  protected readonly area = computed(() => formatHectares(this.lot().area_ha));
  protected readonly campaign = computed(() => latestCampaign(this.lot().campaigns));
  protected readonly last = computed(() => lastEvent(this.events()));
  protected readonly eventDate = computed(() => {
    const e = this.last();
    return e ? formatEventDate(e) : '';
  });
  protected readonly counts = computed(() => countByOrigin(this.events(), ORIGINS));
  protected readonly scene = computed(
    () =>
      buildIsoScene([
        {
          lot: this.lot(),
          campaigns: this.lot().campaigns,
          last: this.last(),
          events: [...this.events()],
        },
      ]).lots,
  );
}
