import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Icon } from '../icon/icon';

/**
 * subnavegación de un lote: ficha, huella, fertilización y rentabilidad, con la vuelta a Mi
 * campo. pestañas claras en una pista blanca; en el celular la pista se desliza de costado y
 * ningún rótulo se corta. la pestaña activa lleva aria-current="page", borde y negrita
 *
 * @example <app-lot-tabs [lotId]="lot.id" />
 */
@Component({
  selector: 'app-lot-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <nav class="bar" aria-label="Secciones del lote">
      <a routerLink="/mapa" class="back"><app-icon name="arrow-left" /> Mi campo</a>
      <div class="track">
        <a
          [routerLink]="['/lotes', lotId()]"
          routerLinkActive="is-active"
          [routerLinkActiveOptions]="{ exact: true }"
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
    :host {
      display: block;
      min-width: 0;
      margin-bottom: var(--space-5);
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-4);
      min-width: 0;
    }
    a {
      --icon-size: 1.1rem;
      display: inline-flex;
      flex: none;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--tap);
      border-radius: var(--radius-pill);
      font-size: var(--text-sm);
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
    }
    a:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
    .back {
      padding: 0 var(--space-3) 0 var(--space-2);
      color: var(--link);
    }
    .back:hover {
      background: var(--paper-2);
    }
    /* la pista se desliza de costado cuando no entra: los rótulos nunca se cortan */
    .track {
      display: flex;
      flex: 0 1 auto;
      gap: var(--space-1);
      min-width: 0;
      max-width: 100%;
      padding: var(--space-1);
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      background: var(--surface);
      box-shadow: var(--shadow-1);
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scroll-snap-type: x proximity;
      scrollbar-width: none;
    }
    .track::-webkit-scrollbar {
      display: none;
    }
    .track a {
      padding: 0 var(--space-4);
      color: var(--ink-3);
      scroll-snap-align: start;
    }
    .track a:hover {
      background: var(--surface-2);
      color: var(--ink);
    }
    /* la activa se distingue por el borde, el fondo y la negrita, no solo por el color */
    .track .is-active {
      background: var(--field-50);
      box-shadow: inset 0 0 0 1.5px var(--field-700);
      color: var(--field-900);
      font-weight: 700;
    }
    .track .is-active:hover {
      background: var(--field-100);
      color: var(--field-900);
    }
    @media (max-width: 40rem) {
      :host {
        margin-bottom: var(--space-4);
      }
      .bar {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-2);
      }
      .back {
        justify-self: start;
      }
      .track a {
        padding: 0 var(--space-3);
      }
    }
  `,
})
export class LotTabs {
  readonly lotId = input.required<number>();
}
