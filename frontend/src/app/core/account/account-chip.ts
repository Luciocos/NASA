import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { LOGIN_PATH, RETURN_PARAM, isAuthScreen, safeReturnUrl } from '../auth/return-url';
import { LotOutbox } from '../offline/lot-outbox';
import { Icon } from '../../shared/ui/icon/icon';

let nextId = 0;

/**
 * la cuenta en el marco: quién ingresó, con la opción de salir, o "Ingresar" sin sesión
 *
 * - `variant="bar"` (por defecto): chip con inicial y nombre en la barra superior; el menú abre
 *   hacia abajo
 * - `variant="tab"`: pestaña "Cuenta" de la barra inferior del celular; el menú abre hacia
 *   arriba
 */
@Component({
  selector: 'app-account-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  // el menú se cierra con Escape o con un clic o toque fuera de él
  host: {
    '[class.is-tab]': "variant() === 'tab'",
    '(document:keydown.escape)': 'closeOnEscape()',
    '(document:pointerdown)': 'closeOnOutsidePointer($event)',
  },
  template: `
    @if (auth.user(); as user) {
      <button
        #chipButton
        type="button"
        class="chip-btn"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? menuId : null"
        (click)="open.set(!open())"
      >
        <span class="avatar" aria-hidden="true">{{ initial() }}</span>
        @if (variant() === 'tab') {
          <span>Account</span>
        } @else {
          <span class="visually-hidden">Account: </span>
          <span class="name">{{ displayName() }}</span>
        }
      </button>
      @if (open()) {
        <div [id]="menuId" class="menu" animate.enter="enter-pop">
          <div>
            <p class="menu__title">{{ displayName() }}</p>
            @if (user.name) {
              <p class="menu__text">{{ user.email }}</p>
            }
          </div>
          <p class="menu__text menu__privacy">
            <app-icon name="check" /> Your fields and your data are private: only you can see them.
          </p>
          @if (pendingCount(); as count) {
            <p class="alert alert--warn">
              You have {{ count }} {{ count === 1 ? 'field' : 'fields' }} not uploaded yet on this
              device: if you log out, {{ count === 1 ? 'it will be' : 'they will be' }} deleted.
            </p>
          }
          <a class="menu-item" routerLink="/ejemplos" (click)="open.set(false)">
            <app-icon name="map" /> Sample fields
          </a>
          <button type="button" class="btn btn--sm btn--block" (click)="exit()">Log out</button>
        </div>
      }
    } @else {
      <a
        class="chip-btn"
        [routerLink]="loginPath"
        [queryParams]="returnParams()"
        [queryParamsHandling]="onAuthScreen() ? 'preserve' : null"
        [attr.aria-current]="onAuthScreen() ? 'page' : null"
      >
        <span class="avatar avatar--guest" aria-hidden="true"><app-icon name="user" /></span>
        <span>Log in</span>
      </a>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }
    .chip-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 2.5rem;
      padding: 0.25rem 0.75rem 0.25rem 0.25rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      background: var(--surface);
      color: var(--ink);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
    .chip-btn:hover {
      background: var(--paper-2);
    }
    .avatar {
      --icon-size: 1rem;
      display: grid;
      flex: none;
      place-items: center;
      width: 1.875rem;
      height: 1.875rem;
      border-radius: 50%;
      background: var(--field-700);
      color: #fff;
      font-weight: 700;
    }
    .avatar--guest {
      background: var(--paper-2);
      color: var(--ink-2);
    }
    .menu {
      position: absolute;
      top: calc(100% + var(--space-2));
      right: 0;
      z-index: var(--z-overlay);
      display: grid;
      gap: var(--space-3);
      width: min(19rem, calc(100vw - 2 * var(--space-4)));
      padding: var(--space-4);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--ink);
      box-shadow: var(--shadow-3);
      transform-origin: top right;
    }
    p {
      margin: 0;
    }
    .menu__title {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .menu__text {
      color: var(--ink-3);
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
    }
    .menu__privacy {
      --icon-size: 1rem;
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      color: var(--ink-2);
    }
    .menu__privacy app-icon {
      flex: none;
      margin-top: 0.125rem;
      color: var(--ok);
    }
    /* pestaña de la barra inferior del celular */
    :host(.is-tab) {
      display: block;
    }
    :host(.is-tab) .chip-btn {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 0.125rem;
      width: 100%;
      min-height: var(--tabbar-h);
      padding: var(--space-1);
      border: 0;
      border-radius: var(--radius-md);
      background: none;
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    :host(.is-tab) .chip-btn:focus-visible {
      outline-offset: -3px;
    }
    :host(.is-tab) .avatar {
      width: 1.75rem;
      height: 1.75rem;
      font-size: var(--text-sm);
    }
    :host(.is-tab) .chip-btn:is([aria-expanded='true'], [aria-current='page']) {
      color: var(--field-900);
      font-weight: 700;
    }
    :host(.is-tab) .chip-btn[aria-expanded='true'] .avatar {
      box-shadow:
        0 0 0 2px var(--surface),
        0 0 0 4px var(--field-700);
    }
    :host(.is-tab) .menu {
      top: auto;
      right: var(--space-1);
      bottom: calc(100% + var(--space-2));
      transform-origin: bottom right;
    }
    @media (max-width: 40rem) {
      .name {
        display: none;
      }
    }
  `,
})
export class AccountChip {
  /** dónde va: la barra superior o la barra de pestañas del celular */
  readonly variant = input<'bar' | 'tab'>('bar');

  protected readonly auth = inject(AuthService);
  private readonly outbox = inject(LotOutbox);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly chipButton = viewChild<ElementRef<HTMLButtonElement>>('chipButton');
  protected readonly menuId = `account-menu-${nextId++}`;
  protected readonly loginPath = LOGIN_PATH;
  protected readonly open = signal(false);

  /** el nombre si lo cargó al crear la cuenta; si no, su mail */
  protected readonly displayName = computed(() => {
    const user = this.auth.user();
    return user ? user.name.trim() || user.email : '';
  });
  protected readonly initial = computed(() => this.displayName().charAt(0).toUpperCase() || '·');

  /** lotes marcados sin conexión que todavía no llegaron al backend: se pierden al salir */
  protected readonly pendingCount = computed(() => this.outbox.pending().length);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly onAuthScreen = computed(() => isAuthScreen(this.url()));
  /** después de ingresar se vuelve a la pantalla donde se tocó "Ingresar" */
  protected readonly returnParams = computed(() => {
    const back = safeReturnUrl(this.url());
    return back && back !== '/' ? { [RETURN_PARAM]: back } : {};
  });

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
    this.auth.logout();
    void this.router.navigateByUrl('/');
  }
}
