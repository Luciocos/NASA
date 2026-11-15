import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';

import { Icon } from '../icon/icon';

/** lo que el menú recorre con las flechas: botones habilitados y enlaces */
const ITEM_SELECTOR = 'button:not(:disabled), a[href]';

let nextId = 0;

/**
 * menú "Más" (⋯) para las acciones secundarias o avanzadas de una pantalla: lo poco usado no
 * ocupa lugar hasta que la persona lo pide
 *
 * el botón lleva nombre accesible (`label`), aria-expanded y aria-controls. la lista es un
 * grupo de botones o enlaces proyectados, no un role="menu": se recorre con Tab como cualquier
 * botón y además con las flechas, Inicio y Fin. flecha abajo sobre el botón abre el menú y
 * enfoca la primera acción
 *
 * se cierra con Escape (el foco vuelve al botón si estaba en el menú), con un toque o clic
 * afuera y al elegir una acción. un interruptor (con aria-pressed) o un ítem con
 * `data-keep-open` lo deja abierto, para ver el cambio sin volver a abrirlo
 *
 * los ítems usan las clases globales de ui.css: `.menu-item` (botón o enlace a todo el ancho;
 * con aria-pressed muestra un interruptor), `.menu-label` (rótulo de un grupo) y `.menu-sep`.
 * adentro de `.hud` el panel toma solo los colores del cromo oscuro
 *
 * @example
 * <app-more-menu label="Más opciones de la maqueta" text="Más" triggerClass="hud__btn"
 *   direction="up">
 *   <button type="button" class="menu-item" (click)="fit()">
 *     <app-icon name="fit" /> Ver todos los lotes
 *   </button>
 *   <button type="button" class="menu-item" [attr.aria-pressed]="grid()"
 *     (click)="grid.set(!grid())"><app-icon name="grid" /> Grilla de hectáreas</button>
 * </app-more-menu>
 */
@Component({
  selector: 'app-more-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    '[class.is-open]': 'open()',
    '[attr.data-align]': 'align()',
    '[attr.data-direction]': 'direction()',
    '(document:keydown.escape)': 'onEscape()',
    '(document:pointerdown)': 'onOutsidePointer($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      [class]="triggerClass()"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? panelId : null"
      (click)="open.set(!open())"
      (keydown.arrowdown)="openFromKeyboard($event)"
    >
      <app-icon name="more" />
      @if (text(); as visibleText) {
        <span>{{ visibleText }}</span>
      }
    </button>
    <div
      #panel
      class="panel enter-pop"
      role="group"
      [id]="panelId"
      [attr.aria-label]="label()"
      [hidden]="!open()"
      (click)="onPanelClick($event)"
      (keydown)="onPanelKeydown($event)"
    >
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }
    .panel {
      position: absolute;
      top: calc(100% + var(--space-2));
      right: 0;
      z-index: var(--z-overlay);
      display: grid;
      gap: 2px;
      width: max-content;
      min-width: 14rem;
      max-width: min(20rem, calc(100vw - 2 * var(--space-4)));
      padding: var(--space-2);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--ink);
      box-shadow: var(--shadow-3);
      text-align: left;
      transform-origin: top right;
    }
    .panel[hidden] {
      display: none;
    }
    :host([data-align='start']) .panel {
      right: auto;
      left: 0;
      transform-origin: top left;
    }
    :host([data-direction='up']) .panel {
      top: auto;
      bottom: calc(100% + var(--space-2));
      transform-origin: bottom right;
    }
  `,
})
export class MoreMenu {
  /** nombre accesible del botón y de la lista. si hay `text`, tiene que contenerlo */
  readonly label = input('More options');
  /** texto visible junto a los tres puntos, por ejemplo "Más" en una barra con rótulos */
  readonly text = input<string | null>(null);
  /** clases del botón: por defecto un botón fantasma con solo el ícono */
  readonly triggerClass = input('btn btn--ghost btn--icon');
  /** hacia dónde se alinea la lista respecto del botón */
  readonly align = input<'start' | 'end'>('end');
  /** abre hacia abajo o hacia arriba (por ejemplo, desde una barra al pie de la maqueta) */
  readonly direction = input<'down' | 'up'>('down');
  /** abierto o cerrado. arranca cerrado */
  readonly open = model(false);

  protected readonly panelId = `more-menu-${nextId++}`;
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  protected openFromKeyboard(event: Event): void {
    event.preventDefault();
    this.open.set(true);
    // el panel se muestra en el próximo render: recién ahí se puede enfocar
    afterNextRender(() => this.items()[0]?.focus(), { injector: this.injector });
  }

  protected onPanelClick(event: Event): void {
    const item = (event.target as Element | null)?.closest(ITEM_SELECTOR);
    if (!item || !this.panel().nativeElement.contains(item)) return;
    if (item.hasAttribute('aria-pressed') || item.hasAttribute('data-keep-open')) return;
    this.close();
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    const items = this.items();
    if (items.length === 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const current = items.indexOf(this.document.activeElement as HTMLElement);
    const last = items.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowDown'
            ? (current + 1) % items.length
            : current <= 0
              ? last
              : current - 1;
    items[next].focus();
  }

  protected onEscape(): void {
    if (this.open()) this.close();
  }

  protected onOutsidePointer(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node | null)) {
      this.open.set(false);
    }
  }

  /** cierra y devuelve el foco al botón si estaba en el menú, nunca se lo saca a otra parte */
  private close(): void {
    const active = this.document.activeElement;
    const inside =
      !active || active === this.document.body || this.host.nativeElement.contains(active);
    this.open.set(false);
    if (inside) this.trigger().nativeElement.focus();
  }

  private items(): HTMLElement[] {
    return [...this.panel().nativeElement.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
  }
}
