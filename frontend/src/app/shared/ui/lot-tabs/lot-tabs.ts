import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Icon } from '../icon/icon';

/**
 * subnavegación de un lote: ficha, huella, fertilización y rentabilidad, con la vuelta a Mi
 * campo (o a Ejemplos, en un lote de ejemplo). pestañas claras en una pista blanca; en el
 * celular las cuatro entran en una fila, con el ícono arriba del rótulo, y si la pantalla es
 * más angosta todavía la pista se desliza de costado: ningún rótulo se corta. la pestaña activa
 * lleva aria-current="page", borde y negrita
 *
 * @example <app-lot-tabs [lotId]="lot.id" [example]="lot.is_example" />
 */
@Component({
  selector: 'app-lot-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <nav class="bar" aria-label="Secciones del lote">
      @if (example()) {
        <a routerLink="/ejemplos" class="back"><app-icon name="arrow-left" /> Ejemplos</a>
      } @else {
        <a routerLink="/mapa" class="back"><app-icon name="arrow-left" /> Mi campo</a>
      }
      <div class="track">
        <a
          [routerLink]="['/lotes', lotId()]"
          routerLinkActive="is-active"
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
          ><app-icon name="satellite" /><span class="long">Ficha y datos NASA</span
          ><span class="short" aria-hidden="true">Ficha</span></a
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
    .short {
      display: none;
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
    /*
     * celular: las cuatro pestañas en una fila que ocupa todo el ancho, con el ícono arriba del
     * rótulo. la primera muestra "Ficha" y conserva "Ficha y datos NASA" como nombre accesible
     */
    @media (max-width: 40rem) {
      :host {
        margin-bottom: var(--space-4);
      }
      .bar {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-1);
      }
      .back {
        justify-self: start;
      }
      .track {
        border-radius: var(--radius-lg);
      }
      .track a {
        position: relative;
        flex: 1 0 auto;
        flex-direction: column;
        justify-content: center;
        gap: 0.125rem;
        min-height: 3.25rem;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-md);
        font-size: var(--text-xs);
        line-height: 1.2;
      }
      .long {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .short {
        display: inline;
      }
    }
  `,
})
export class LotTabs {
  readonly lotId = input.required<number>();
  /** lote de ejemplo: la vuelta lleva a Ejemplos en vez de a Mi campo */
  readonly example = input(false, { transform: booleanAttribute });
}
