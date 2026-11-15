import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Icon } from '../../../../shared/ui/icon/icon';

let nextId = 0;

/**
 * ayuda chica detrás de un botón (i): el detalle que no hace falta tener a la vista (por qué,
 * de dónde sale un dato, qué significa), con el nombre del botón como título. es un popover
 * nativo: se abre y se cierra con el botón, con Escape o tocando afuera, y el foco vuelve al
 * botón. vive en la capa superior, así que ni una tarjeta deslizable ni el popup del lote lo
 * recortan. donde hay anchor positioning queda pegado al botón; si no, centrado en la pantalla.
 * el contenido está siempre en el DOM
 *
 * mismo aspecto que el (i) del popup del lote (features/lot/lot-workspace/info-tip.ts), con
 * otro selector y otro prefijo de id: así los dos conviven en la misma pantalla sin pisarse
 * (Angular les daría el mismo id de componente y los popovers se cruzarían)
 *
 * @example
 * <app-practice-tip label="Por qué conviene">
 *   <p>Mantiene el suelo cubierto en invierno.</p>
 * </app-practice-tip>
 */
@Component({
  selector: 'app-practice-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      type="button"
      class="tip-trigger"
      [attr.popovertarget]="panelId"
      [attr.aria-label]="label()"
      [style.anchor-name]="anchor"
    >
      <app-icon name="info" />
    </button>
    <div class="tip" popover [id]="panelId" [style.position-anchor]="anchor">
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

    /* el (i) mide 44 px para el dedo, pero a la vista es un círculo chico del alto de la línea */
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

    .tip-trigger:hover,
    .tip-trigger:has(+ .tip:popover-open) {
      background: var(--paper-2);
      color: var(--ink);
    }

    .tip-trigger:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -4px;
    }

    /* sin anchor positioning, el navegador lo centra en la pantalla */
    .tip {
      width: max-content;
      max-width: min(22rem, calc(100vw - 2rem));
      max-height: min(28rem, calc(100dvh - 2rem));
      overflow: auto;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
      box-shadow: var(--shadow-3);
      color: var(--ink-2);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      font-style: normal;
      font-weight: 400;
      letter-spacing: normal;
      line-height: 1.45;
      text-align: left;
      text-transform: none;
      white-space: normal;
    }

    .tip:popover-open {
      animation: tip-in var(--dur-2) var(--ease-out);
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

    @keyframes tip-in {
      from {
        opacity: 0;
        transform: translateY(-0.25rem);
      }
    }
  `,
})
export class PracticeTip {
  /** nombre del botón y título de la ayuda: "Cómo lo mide MODIS", "Por qué conviene" */
  readonly label = input.required<string>();

  protected readonly panelId = `practice-tip-${++nextId}`;
  protected readonly anchor = `--practice-tip-${nextId}`;
}
