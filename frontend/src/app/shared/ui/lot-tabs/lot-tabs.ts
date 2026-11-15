import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Icon } from '../icon/icon';

/** subnavegación de un lote: ficha, huella, fertilización y rentabilidad */
@Component({
  selector: 'app-lot-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <nav class="tabs-bar" aria-label="Secciones del lote">
      <a routerLink="/mapa" class="back"><app-icon name="arrow-left" /> Mi campo</a>
      <div class="tabs-list">
        <a
          [routerLink]="['/lotes', lotId()]"
          routerLinkActive="is-active"
          ariaCurrentWhenActive="page"
          ><app-icon name="satellite" /> Ficha y datos NASA</a
        >
        <a
          [routerLink]="['/huella', lotId()]"
          routerLinkActive="is-active"
          ariaCurrentWhenActive="page"
          ><app-icon name="footprint" /> Huella</a
        >
        <a
          [routerLink]="['/lotes', lotId(), 'fertilizacion']"
          routerLinkActive="is-active"
          ariaCurrentWhenActive="page"
          ><app-icon name="leaf" /> Fertilización</a
        >
        <a
          [routerLink]="['/lotes', lotId(), 'rentabilidad']"
          routerLinkActive="is-active"
          ariaCurrentWhenActive="page"
          ><app-icon name="coins" /> Rentabilidad</a
        >
      </div>
    </nav>
  `,
  styles: `
    .tabs-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-4);
      margin-bottom: var(--space-4);
    }
    a {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--ink-2);
      font-size: var(--text-sm);
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
    }
    .back {
      color: var(--link, var(--info));
    }
    .tabs-list {
      display: flex;
      gap: 2px;
      padding: 3px;
      border-radius: var(--radius-md);
      background: var(--paper-2);
      overflow-x: auto;
    }
    .tabs-list a {
      padding: var(--space-2) var(--space-3);
      border-radius: calc(var(--radius-md) - 3px);
    }
    .tabs-list a:hover {
      background: var(--surface);
    }
    .tabs-list .is-active {
      background: var(--surface);
      box-shadow:
        var(--shadow-1),
        inset 0 -2px 0 var(--field-700);
      color: var(--ink);
    }
    a:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  `,
})
export class LotTabs {
  readonly lotId = input.required<number>();
}
