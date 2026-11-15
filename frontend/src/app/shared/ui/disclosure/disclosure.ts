import { ChangeDetectionStrategy, Component, booleanAttribute, input, model } from '@angular/core';

import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';

/**
 * bloque plegable con details y summary, cerrado por defecto: lo técnico a pedido (órbitas,
 * sensores, nubosidad, tablas, filtros, fuentes). el contenido está siempre en el DOM, así que
 * el buscador del navegador y las pruebas lo encuentran aunque esté cerrado
 *
 * `open` es un model: [(open)] sigue lo que hace la persona. con `flat` pierde el borde y el
 * fondo, para ir al pie de una tarjeta
 *
 * @example
 * <app-disclosure hint="Órbitas, sensores y nubosidad">
 *   <table class="table">...</table>
 * </app-disclosure>
 *
 * <app-disclosure label="Cómo leer la maqueta" icon="info" flat>...</app-disclosure>
 */
@Component({
  selector: 'app-disclosure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { '[class.is-flat]': 'flat()' },
  template: `
    <details [open]="open()" (toggle)="onToggle($event)">
      <summary>
        @if (icon(); as name) {
          <app-icon class="lead-icon" [name]="name" />
        }
        <span class="label">{{ label() }}</span>
        @if (hint(); as hintText) {
          <span class="hint">{{ hintText }}</span>
        }
        <app-icon class="chevron" name="chevron-down" />
      </summary>
      <div class="body"><ng-content /></div>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
    details {
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
    }
    :host(.is-flat) details {
      border: 0;
      background: none;
    }
    summary {
      --icon-size: 1.1rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1) var(--space-2);
      min-height: var(--tap);
      padding: var(--space-2) var(--space-4);
      border-radius: inherit;
      color: var(--ink-2);
      font-size: var(--text-sm);
      font-weight: 600;
      list-style: none;
      cursor: pointer;
      user-select: none;
    }
    :host(.is-flat) summary {
      padding-inline: 0;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary:hover {
      color: var(--ink);
    }
    summary:hover .label {
      text-decoration: underline;
      text-underline-offset: 0.18em;
    }
    .lead-icon {
      color: var(--ink-3);
    }
    .hint {
      color: var(--ink-3);
      font-weight: 400;
    }
    .chevron {
      margin-left: auto;
      color: var(--ink-3);
      transition: rotate var(--dur-2) var(--ease-out);
    }
    details[open] > summary .chevron {
      rotate: 180deg;
    }
    .body {
      padding: 0 var(--space-4) var(--space-4);
      color: var(--ink-2);
      font-size: var(--text-sm);
    }
    :host(.is-flat) .body {
      padding-inline: 0;
    }
  `,
})
export class Disclosure {
  /** texto del summary */
  readonly label = input('See technical details');
  /** aclaración corta al lado del rótulo: qué hay adentro */
  readonly hint = input<string | null>(null);
  /** ícono opcional antes del rótulo */
  readonly icon = input<IconName | null>(null);
  /** abierto o cerrado. arranca cerrado */
  readonly open = model(false);
  /** sin borde ni fondo, para el pie de una tarjeta */
  readonly flat = input(false, { transform: booleanAttribute });

  protected onToggle(event: Event): void {
    this.open.set((event.target as HTMLDetailsElement).open);
  }
}
