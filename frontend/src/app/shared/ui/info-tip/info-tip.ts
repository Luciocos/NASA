import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';

import { Icon } from '../icon/icon';

let nextId = 0;

/** margen con el borde de la ventana y separación con el botón, en px */
const EDGE = 12;
const GAP = 6;
/** ancho de la ayuda (22rem), el mismo que dice el CSS */
const WIDTH = 352;

/**
 * botón (i) con una ayuda chica: lo que explica un dato (cómo se calcula, de dónde sale, qué
 * significa su origen, fuentes largas) sin dejar un párrafo a la vista. el botón mide 44 px para
 * el dedo y a la vista es un círculo chico del alto de la línea
 *
 * usa el popover nativo del navegador: se abre y se cierra con el botón, con Escape o con un
 * toque afuera, y se cierra solo al desplazar la página, el popup o una pista de tarjetas. vive
 * en la capa superior, así que ni una tarjeta deslizable ni el popup del lote lo recortan. se
 * ubica debajo del botón (o arriba si no entra), sin salirse de la ventana. no atrapa el foco: es
 * una nota, no un diálogo. el contenido está siempre en el DOM (lo leen los lectores de pantalla
 * y las pruebas) y cada ayuda tiene su propio id
 *
 * @example
 * <app-info-tip label="Cómo se calcula">
 *   <p>El verdor es el NDVI medio del lote.</p>
 * </app-info-tip>
 */
@Component({
  selector: 'app-info-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      #button
      type="button"
      class="tip-trigger"
      [attr.popovertarget]="id"
      [attr.aria-label]="label()"
    >
      <app-icon name="info" />
    </button>
    <div
      #panel
      class="tip"
      popover
      [id]="id"
      (beforetoggle)="onBeforeToggle($event)"
      (toggle)="onToggle($event)"
    >
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
    /* 44 px de toque, pero ocupa en la línea lo que un ícono: no agranda títulos ni filas */
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
    .tip {
      position: fixed;
      inset: auto;
      width: min(22rem, calc(100vw - 1.5rem));
      max-height: min(60vh, 28rem);
      margin: 0;
      padding: var(--space-3) var(--space-4);
      overflow: auto;
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
    .tip__title {
      margin: 0 0 var(--space-1);
      color: var(--ink);
      font-weight: 700;
    }
    .tip__body {
      display: grid;
      gap: var(--space-2);
    }
    .tip__body ::ng-deep :where(p, ul, ol, dl) {
      margin: 0;
    }
    .tip__body ::ng-deep :where(ul, ol) {
      display: grid;
      gap: var(--space-1);
      padding-left: 1.1rem;
    }
    .tip__body ::ng-deep strong {
      color: var(--ink);
    }
    @keyframes tip-in {
      from {
        opacity: 0;
        transform: translateY(-0.25rem);
      }
    }
  `,
})
export class InfoTip {
  /** nombre del botón y título de la ayuda: "Cómo se calcula", "De dónde sale el rinde" */
  readonly label = input.required<string>();

  /** único en la app: las ayudas de una misma pantalla nunca se cruzan */
  readonly id = `info-tip-${++nextId}`;

  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  /** al desplazar la página, el popup o una pista, la ayuda se cierra: no queda flotando lejos */
  private readonly closeOnScroll = (event: Event): void => {
    const panel = this.panel().nativeElement;
    if (event.target instanceof Node && panel.contains(event.target)) return;
    this.hide();
  };
  private readonly closeOnResize = (): void => this.hide();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unlisten());
  }

  /** antes de mostrarse: debajo del botón, centrada en él y sin salirse de la ventana */
  protected onBeforeToggle(event: Event): void {
    if ((event as ToggleEvent).newState !== 'open') return;
    const panel = this.panel().nativeElement;
    const rect = this.button().nativeElement.getBoundingClientRect();
    const width = Math.min(WIDTH, window.innerWidth - 2 * EDGE);
    const left = Math.min(
      Math.max(EDGE, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - EDGE - width,
    );
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(rect.bottom + GAP)}px`;
  }

  /** ya abierta: si no entra abajo y hay más lugar arriba, pasa arriba del botón */
  protected onToggle(event: Event): void {
    if ((event as ToggleEvent).newState !== 'open') {
      this.unlisten();
      return;
    }
    const panel = this.panel().nativeElement;
    const rect = this.button().nativeElement.getBoundingClientRect();
    const height = panel.offsetHeight;
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    if (height > below && above > below) {
      panel.style.top = `${Math.round(Math.max(EDGE, rect.top - GAP - height))}px`;
    }
    document.addEventListener('scroll', this.closeOnScroll, { capture: true, passive: true });
    window.addEventListener('resize', this.closeOnResize, { passive: true });
  }

  private hide(): void {
    try {
      this.panel().nativeElement.hidePopover();
    } catch {
      // sin popover nativo (navegador viejo): la ayuda queda a la vista y no hay nada que cerrar
    }
    this.unlisten();
  }

  private unlisten(): void {
    document.removeEventListener('scroll', this.closeOnScroll, { capture: true });
    window.removeEventListener('resize', this.closeOnResize);
  }
}
