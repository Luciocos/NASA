import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Icon } from '../../../shared/ui/icon/icon';

let nextId = 0;

/**
 * botón (i) con una ayuda chica: lo que explica un dato (cómo se calcula, de dónde sale, qué
 * significa su origen) sin dejar un párrafo a la vista. usa el popover del navegador: se abre
 * con un toque, se cierra con otro toque afuera o con Escape, y queda por encima del popup del
 * lote. con anclaje de CSS aparece pegada al botón; sin él, centrada en la pantalla. el
 * contenido está siempre en el DOM
 *
 * @example
 * <app-info-tip label="Cómo se calcula">El verdor es el NDVI medio del lote…</app-info-tip>
 */
@Component({
  selector: 'app-info-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      type="button"
      class="tip-trigger"
      [attr.popovertarget]="id"
      [attr.aria-label]="label()"
      [style.anchor-name]="anchor"
    >
      <app-icon name="info" />
    </button>
    <div class="tip" popover [id]="id" [style.position-anchor]="anchor">
      <p class="tip__title">{{ label() }}</p>
      <div class="tip__body"><ng-content /></div>
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      vertical-align: middle;
    }
    /* el (i) mide 44 px para el dedo, pero a la vista es un círculo chico */
    .tip-trigger {
      --icon-size: 1.15rem;
      display: inline-grid;
      place-items: center;
      width: var(--tap);
      height: var(--tap);
      margin: calc((1.5rem - var(--tap)) / 2);
      padding: 0;
      border: 0;
      border-radius: var(--radius-pill);
      background: none;
      color: var(--ink-3);
      cursor: pointer;
    }
    .tip-trigger:hover {
      background: var(--paper-2);
      color: var(--ink);
    }
    .tip-trigger:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -4px;
    }
    .tip {
      width: max-content;
      max-width: min(22rem, calc(100vw - 2rem));
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--ink-2);
      box-shadow: var(--shadow-3);
      font-size: var(--text-sm);
      font-weight: 400;
      line-height: 1.45;
      text-align: left;
      text-transform: none;
      letter-spacing: normal;
    }
    @supports (position-area: bottom) {
      .tip {
        inset: auto;
        margin: var(--space-1);
        position-area: bottom span-right;
        position-try-fallbacks:
          flip-inline,
          flip-block,
          flip-block flip-inline;
      }
    }
    .tip__title {
      margin: 0 0 var(--space-1);
      color: var(--ink);
      font-weight: 700;
    }
    .tip__body {
      display: grid;
      gap: var(--space-2);
    }
    .tip__body ::ng-deep p,
    .tip__body ::ng-deep ul {
      margin: 0;
    }
    .tip__body ::ng-deep ul {
      display: grid;
      gap: var(--space-1);
      padding-left: 1.1rem;
    }
  `,
})
export class InfoTip {
  /** nombre del botón y título de la ayuda: "Cómo se calcula", "De dónde sale" */
  readonly label = input('Más información');

  protected readonly id = `info-tip-${nextId++}`;
  protected readonly anchor = `--${this.id}`;
}
