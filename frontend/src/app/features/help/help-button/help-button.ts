import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { HelpGuide } from '../help-guide/help-guide';

let nextId = 0;

/**
 * botón "?" redondo de 44 px que abre la guía para cargar información, con imágenes, en un
 * diálogo modal. sirve en la barra de arriba y en el encabezado del popup del lote, al lado de
 * ⋯ y de Cerrar: el diálogo se abre en la capa superior, así que queda encima del popup
 *
 * es un <dialog> nativo con showModal: el foco queda adentro (arranca en Siguiente); Escape, la
 * X, Listo o un toque en el fondo lo cierran y el foco vuelve al botón. mientras está abierto,
 * la pantalla de atrás no se desplaza y las teclas no le llegan (por ejemplo, los atajos del
 * alta de lote). la guía se arma recién al abrir y arranca siempre en `step`
 *
 * `step` es la clave de un paso o la pestaña del popup: en el popup del lote, la pestaña abierta
 * ('footprint' o 'huella' abre en el paso de la huella). sin paso, arranca en el primero
 *
 * @example <app-help-button />
 * @example <app-help-button [step]="tab()" />
 * @example <app-help-button step="marcar" text="Ayuda" />
 */
@Component({
  selector: 'app-help-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HelpGuide],
  template: `
    <button
      #trigger
      type="button"
      class="trigger"
      [class.has-text]="!!text()"
      [attr.aria-label]="label()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="dialogId"
      (click)="show()"
    >
      <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8.25 8.75a3.75 3.75 0 0 1 7.5.4c0 2.6-3.75 3.1-3.75 5.6M12 19h.01" />
      </svg>
      @if (text(); as visible) {
        <span>{{ visible }}</span>
      }
    </button>
    <dialog
      #dialog
      class="help-dialog"
      tabindex="-1"
      [id]="dialogId"
      [attr.aria-labelledby]="titleId"
      (cancel)="onCancel($event)"
      (close)="onNativeClose()"
      (keydown)="onKeydown($event)"
      (pointerdown)="onPointerDown($event)"
      (click)="onBackdropClick($event)"
    >
      @if (open()) {
        <div class="sheet">
          <app-help-guide
            heading="How to enter your data"
            closable
            [headingId]="titleId"
            [start]="step()"
            (closed)="hide()"
            (done)="hide()"
          />
        </div>
      }
    </dialog>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    /* un círculo verde suave con el signo de pregunta: se distingue de ⋯ y de Cerrar */
    .trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      width: var(--tap);
      height: var(--tap);
      padding: 0;
      border: 1px solid var(--field-100);
      border-radius: var(--radius-pill);
      background: var(--field-50);
      color: var(--field-800);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 700;
      line-height: 1;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color var(--dur-1) var(--ease-out);
    }
    .trigger.has-text {
      width: auto;
      padding: 0 var(--space-4) 0 var(--space-3);
    }
    .trigger:hover,
    .trigger[aria-expanded='true'] {
      background: var(--field-100);
    }
    .trigger:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
    .glyph {
      flex: none;
      width: 1.5rem;
      height: 1.5rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /*
     * el diálogo: tarjeta blanca centrada, encima de todo (también del popup del lote). lo que se
     * desplaza es la hoja de adentro: un toque en su barra no cuenta como toque en el fondo
     */
    .help-dialog {
      width: min(36rem, calc(100vw - 2rem));
      max-width: none;
      max-height: none;
      margin: auto;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: var(--radius-xl);
      background: var(--surface);
      box-shadow: var(--shadow-3);
      /* lo que hereda del lugar donde está el botón (barra, encabezado) vuelve a lo normal */
      color: var(--ink);
      font-family: var(--font-sans);
      font-size: var(--text-md);
      font-style: normal;
      font-weight: 400;
      letter-spacing: normal;
      line-height: var(--leading-normal);
      text-align: left;
      text-transform: none;
      white-space: normal;
    }
    .help-dialog::backdrop {
      background: rgb(21 33 26 / 48%);
      backdrop-filter: blur(2px);
    }
    .sheet {
      max-height: calc(100vh - 2rem);
      max-height: calc(100dvh - 2rem);
      padding: var(--space-3) var(--space-5) var(--space-5);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    @media (prefers-reduced-motion: no-preference) {
      .help-dialog[open] {
        animation: help-dialog-in var(--dur-3) var(--ease-out);
      }
      .help-dialog[open]::backdrop {
        animation: help-backdrop-in 240ms ease-out;
      }
    }
    @keyframes help-dialog-in {
      from {
        opacity: 0;
        translate: 0 1rem;
        scale: 0.985;
      }
    }
    @keyframes help-backdrop-in {
      from {
        opacity: 0;
      }
    }
    @media (max-width: 40rem) {
      .help-dialog {
        width: calc(100vw - 1.5rem);
      }
      .sheet {
        max-height: calc(100vh - 1.5rem);
        max-height: calc(100dvh - 1.5rem);
        padding: var(--space-2) var(--space-4) var(--space-4);
      }
    }
  `,
})
export class HelpButton {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  /** el paso en el que abre: su clave ('huella') o la pestaña del popup del lote ('footprint') */
  readonly step = input<string | null | undefined>(null);
  /** nombre accesible del botón. si hay `text`, tiene que contenerlo */
  readonly label = input('Help: how to enter your data');
  /** texto a la vista junto al signo, por ejemplo "Ayuda" en una barra con lugar */
  readonly text = input<string | null>(null);

  protected readonly open = signal(false);
  protected readonly dialogId = `help-dialog-${++nextId}`;
  protected readonly titleId = `help-title-${nextId}`;

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly guide = viewChild(HelpGuide);
  /** lo que tenía la página antes de trabarle el desplazamiento, si la trabó este botón */
  private locked: { overflow: string; gutter: string } | null = null;
  /** el toque empezó en el fondo atenuado (no adentro, arrastrando hacia afuera) */
  private pressedBackdrop = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (!this.open()) return;
      this.closeDialog();
      this.unlock();
    });
  }

  /** abre la guía en el paso pedido, encima de todo, con el foco en Siguiente */
  show(): void {
    if (this.open()) return;
    this.open.set(true);
    this.lock();
    const dialog = this.dialogEl().nativeElement;
    if (!dialog.open && !dialog.hasAttribute('open')) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    afterNextRender(() => this.guide()?.focusNext(), { injector: this.injector });
  }

  /** cierra y devuelve el foco al botón */
  hide(): void {
    if (!this.open()) return;
    this.closeDialog();
    this.open.set(false);
    this.unlock();
    this.trigger().nativeElement.focus({ preventScroll: true });
  }

  /** Escape (o el gesto de volver del celular): cierra la ayuda y nada más */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.hide();
  }

  /** el navegador lo cerró por su cuenta: se cierra igual */
  protected onNativeClose(): void {
    if (this.open()) this.hide();
  }

  /**
   * Escape cierra solo la ayuda (el popup del lote, si está debajo, sigue abierto). ninguna
   * tecla sale del diálogo: los atajos de la pantalla de atrás no se disparan
   */
  protected onKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.hide();
  }

  /** un toque en el fondo atenuado cierra: el fondo es el propio <dialog> */
  protected onPointerDown(event: Event): void {
    this.pressedBackdrop = event.target === this.dialogEl().nativeElement;
  }

  protected onBackdropClick(event: Event): void {
    const backdrop = this.pressedBackdrop && event.target === this.dialogEl().nativeElement;
    this.pressedBackdrop = false;
    if (backdrop) this.hide();
  }

  private closeDialog(): void {
    const dialog = this.dialogEl().nativeElement;
    if (!dialog.open && !dialog.hasAttribute('open')) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  /**
   * la pantalla de atrás no se desplaza mientras la ayuda está abierta. si ya estaba trabada
   * (por ejemplo, por el popup del lote) no se toca: la destraba quien la trabó
   */
  private lock(): void {
    const root = this.document.documentElement;
    if (this.locked || root.style.overflow === 'hidden') return;
    const view = this.document.defaultView;
    this.locked = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    if (view && view.innerWidth > root.clientWidth) root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
  }

  private unlock(): void {
    if (!this.locked) return;
    const root = this.document.documentElement;
    root.style.overflow = this.locked.overflow;
    root.style.scrollbarGutter = this.locked.gutter;
    this.locked = null;
  }
}
