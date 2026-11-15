import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { DemoAccount } from './demo-account';

/** chip de la cuenta demo en el encabezado, con la opción de salir */
@Component({
  selector: 'app-account-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // el menú se cierra con Escape o con un clic o toque fuera de él
  host: {
    '(document:keydown.escape)': 'closeOnEscape()',
    '(document:pointerdown)': 'closeOnOutsidePointer($event)',
  },
  template: `
    @if (account.session(); as session) {
      <button
        #chipButton
        type="button"
        class="chip-btn"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? 'account-menu' : null"
        (click)="open.set(!open())"
      >
        <span class="avatar" aria-hidden="true">{{ initial() }}</span>
        <span class="name">{{ session.name }}</span>
        <span class="plan">Free</span>
      </button>
      @if (open()) {
        <div id="account-menu" class="menu" animate.enter="enter-pop">
          <p class="menu__title">Cuenta demo gratuita</p>
          <p class="menu__text">
            Vive en este navegador: no pide mail ni contraseña. Tenés
            {{ lotCount() }} {{ lotCount() === 1 ? 'lote propio' : 'lotes propios' }}.
          </p>
          <button type="button" class="menu__exit" (click)="exit()">Salir de la demo</button>
        </div>
      }
    }
  `,
  styles: `
    :host {
      position: relative;
    }
    .chip-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.25rem 0.6rem 0.25rem 0.25rem;
      border: 1px solid var(--night-600);
      border-radius: var(--radius-pill);
      background: var(--night-800);
      color: var(--night-ink);
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;
    }
    .chip-btn:hover {
      background: var(--night-700);
    }
    .chip-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .avatar {
      display: grid;
      place-items: center;
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 50%;
      background: var(--field-500);
      color: #fff;
      font-weight: 700;
    }
    .plan {
      padding: 0.05rem 0.4rem;
      border-radius: var(--radius-pill);
      background: var(--accent);
      color: var(--accent-ink);
      font-size: var(--text-xs);
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .menu {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      z-index: var(--z-overlay);
      width: min(18rem, 80vw);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--ink);
      box-shadow: var(--shadow-3);
    }
    .menu__title {
      margin: 0 0 var(--space-1);
      font-weight: 700;
    }
    .menu__text {
      margin: 0 0 var(--space-3);
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .menu__exit {
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--danger);
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;
    }
    @media (max-width: 40rem) {
      .name {
        display: none;
      }
    }
  `,
})
export class AccountChip {
  protected readonly account = inject(DemoAccount);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly chipButton = viewChild<ElementRef<HTMLButtonElement>>('chipButton');
  protected readonly open = signal(false);
  protected readonly lotCount = computed(() => this.account.lotIds().size);
  protected readonly initial = computed(() => (this.account.session()?.name ?? 'C').charAt(0));

  protected closeOnEscape(): void {
    if (!this.open()) return;
    this.open.set(false);
    // el foco vuelve al chip si estaba en el chip o en el menú, no si ya estaba en otra parte
    const active = this.document.activeElement;
    if (!active || active === this.document.body || this.host.nativeElement.contains(active)) {
      this.chipButton()?.nativeElement.focus();
    }
  }

  protected closeOnOutsidePointer(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node | null)) {
      this.open.set(false);
    }
  }

  protected exit(): void {
    this.open.set(false);
    this.account.end();
    void this.router.navigateByUrl('/');
  }
}
