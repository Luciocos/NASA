import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { formatHectares } from '../../../core/insights';
import { LotDetail } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { PageHeader } from '../../../shared/ui/page-header/page-header';

/**
 * encabezado corto de la ficha: el nombre del lote, su superficie y su lugar, y en un ejemplo
 * el aviso de que es de solo lectura. nada más arriba: los datos, las prácticas y la bitácora
 * van debajo. lleva la clase de la transición de vista que lo une a la tarjeta de Mi campo
 */
@Component({
  selector: 'app-lot-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, Icon],
  template: `
    @let l = lot();
    <app-page-header
      class="vt-lot-hero"
      [kicker]="owned() ? 'Tu lote' : null"
      [heading]="l.name"
      [headingId]="'lot-title-' + l.id"
      [subtitle]="subtitle()"
    >
      @if (l.is_example) {
        <p class="readonly"><app-icon name="eye" /> Lote de ejemplo: es de solo lectura</p>
      }
    </app-page-header>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--space-5);
    }
    .readonly {
      --icon-size: 1rem;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      justify-self: start;
      margin: var(--space-1) 0 0;
      color: var(--ink-3);
      font-size: var(--text-sm);
      font-weight: 600;
    }
    @media (max-width: 40rem) {
      :host {
        margin-bottom: var(--space-4);
      }
    }
  `,
})
export class LotHero {
  readonly lot = input.required<LotDetail>();
  readonly owned = input(false);

  /** "23,4 ha · Casilda, Santa Fe": superficie del polígono y lugar, en una línea */
  protected readonly subtitle = computed(() => {
    const lot = this.lot();
    const place = [lot.locality, lot.province].filter(Boolean).join(', ');
    return [formatHectares(lot.area_ha), place].filter(Boolean).join(' · ');
  });
}
