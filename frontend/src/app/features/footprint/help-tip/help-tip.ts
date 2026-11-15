import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';

import { Icon } from '../../../shared/ui/icon/icon';

let nextId = 0;

/** margen con el borde de la ventana y separación con el botón, en px */
const EDGE = 12;
const GAP = 6;

/**
 * ayuda chica detrás de un botón (i): cómo se calcula, de dónde sale un dato, fuentes largas.
 * no ocupa lugar a la vista y el contenido está siempre en el DOM (lo leen los lectores de
 * pantalla y las pruebas). usa el popover nativo: se abre y se cierra con el botón, con Escape
 * o con un toque afuera, y se cierra solo al desplazar. no atrapa el foco: es una nota, no un
 * diálogo. se ubica debajo del botón (o arriba si no entra), sin salirse de la ventana
 *
 * @example
 * <app-help-tip label="¿De dónde sale cada dato?">
 *   <p>Verificado: observado por satélite.</p>
 * </app-help-tip>
 */
@Component({
  selector: 'app-help-tip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button
      #button
      type="button"
      class="btn btn--ghost btn--icon trigger"
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
    .trigger {
      --icon-size: 1.125rem;
      color: var(--ink-3);
    }
    .trigger:hover {
      color: var(--ink);
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
      font-size: var(--text-sm);
      font-weight: 400;
      letter-spacing: 0;
      line-height: 1.45;
      text-align: left;
      text-transform: none;
      white-space: normal;
    }
    .tip__title {
      margin: 0 0 var(--space-2);
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
  `,
})
export class HelpTip {
  /** nombre del botón y título de la ayuda: "¿De dónde sale cada dato?" */
  readonly label = input.required<string>();

  protected readonly id = `help-tip-${nextId++}`;

  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  /** al desplazar la página (o el popup) la ayuda se cierra: no queda flotando lejos del botón */
  private readonly closeOnScroll = (event: Event): void => {
    const panel = this.panel().nativeElement;
    if (event.target instanceof Node && panel.contains(event.target)) return;
    this.hide();
  };
  private readonly closeOnResize = (): void => this.hide();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unlisten());
  }

  /** antes de mostrarse: debajo del botón, centrada y sin salirse de la ventana */
  protected onBeforeToggle(event: Event): void {
    if ((event as ToggleEvent).newState !== 'open') return;
    const panel = this.panel().nativeElement;
    const rect = this.button().nativeElement.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 2 * EDGE);
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
