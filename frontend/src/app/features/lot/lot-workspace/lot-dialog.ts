import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { LOT_TAB_SLUGS, lotTabFromSlug } from '../../../shared/ui/lot-tabs/lot-tabs';
import {
  LOT_DIALOG_STATE,
  LOT_INNER_PARAM,
  LOT_PARAM,
  LOT_TAB_PARAM,
  lotDialogParams,
} from './lot-link';
import { LotTabChange, LotWorkspace } from './lot-workspace';

/**
 * el popup grande del lote, encima de la pantalla que lo abre (Mi campo, Ejemplos), que se
 * sigue viendo atenuada detrás. lo abre la dirección: ?lote=12 (Satélite) o
 * ?lote=12&seccion=huella, así un enlace pegado abre la pantalla con el popup, atrás lo cierra
 * y adelante lo reabre. adentro va el espacio del lote (encabezado, pestañas y contenido)
 *
 * es un <dialog> nativo con showModal: el foco queda adentro, Escape y Cerrar lo cierran, el
 * foco vuelve a donde estaba y la pantalla de atrás no se desplaza mientras está abierto. en la
 * compu ocupa casi toda la ventana; en el celular, la pantalla entera. entra con un movimiento
 * chico que respeta prefers-reduced-motion
 *
 * para abrirlo: el enlace `appLotLink` o `openLot()` (lot-link.ts)
 *
 * @example <app-lot-dialog />
 */
@Component({
  selector: 'app-lot-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LotWorkspace],
  template: `
    <dialog
      #dialog
      class="lot-dialog"
      tabindex="-1"
      [attr.aria-labelledby]="labelId()"
      (cancel)="onCancel($event)"
      (close)="onNativeClose()"
      (keydown)="onKeydown($event)"
      (pointerdown)="onPointerDown($event)"
      (click)="onBackdropClick($event)"
    >
      @if (lotId(); as id) {
        <app-lot-workspace
          class="workspace"
          mode="dialog"
          [lotId]="id"
          [tab]="tab()"
          (tabChange)="selectTab($event)"
          (closed)="close()"
        />
      }
    </dialog>
  `,
  styles: `
    :host {
      display: contents;
    }
    .lot-dialog {
      width: min(75rem, 94vw);
      max-width: none;
      height: min(56rem, 90vh);
      height: min(56rem, 90dvh);
      max-height: none;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: var(--radius-xl);
      background: var(--paper);
      color: var(--ink);
      box-shadow: var(--shadow-3);
      overflow: hidden;
      overscroll-behavior: contain;
    }
    .lot-dialog[open] {
      display: flex;
      flex-direction: column;
    }
    .lot-dialog::backdrop {
      background: rgb(21 33 26 / 48%);
      backdrop-filter: blur(2px);
    }
    .workspace {
      flex: 1;
      min-height: 0;
    }
    @media (prefers-reduced-motion: no-preference) {
      .lot-dialog[open] {
        animation: lot-dialog-in var(--dur-3) var(--ease-out);
      }
      .lot-dialog[open]::backdrop {
        animation: lot-backdrop-in 240ms ease-out;
      }
    }
    @keyframes lot-dialog-in {
      from {
        opacity: 0;
        translate: 0 1rem;
        scale: 0.985;
      }
    }
    @keyframes lot-backdrop-in {
      from {
        opacity: 0;
      }
    }
    /* en el celular, la pantalla entera: el popup es la pantalla del lote */
    @media (max-width: 40rem) {
      .lot-dialog {
        width: 100%;
        height: 100%;
        height: 100dvh;
        margin: 0;
        border: 0;
        border-radius: 0;
      }
    }
  `,
})
export class LotDialog {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly document = inject(DOCUMENT);
  private readonly dialogEl = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot?.queryParamMap ?? convertToParamMap({}),
  });
  /** el lote abierto, o null si el popup está cerrado */
  protected readonly lotId = computed(() => {
    const raw = this.params().get(LOT_PARAM);
    const id = raw === null ? NaN : Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  protected readonly tab = computed(() => lotTabFromSlug(this.params().get(LOT_TAB_PARAM)));
  protected readonly labelId = computed(() => {
    const id = this.lotId();
    return id === null ? null : `lot-title-${id}`;
  });

  /** donde estaba el foco al abrir: vuelve ahí al cerrar */
  private opener: HTMLElement | null = null;
  /** lo que tenía la página antes de trabarle el desplazamiento */
  private locked: { overflow: string; gutter: string } | null = null;
  /** ya se pidió cerrar: un segundo toque no vuelve dos pasos atrás */
  private closing = false;
  /** el toque empezó en el fondo atenuado (no adentro, arrastrando hacia afuera) */
  private pressedBackdrop = false;

  constructor() {
    // la dirección manda: con ?lote= el popup se abre y sin él se cierra
    afterRenderEffect(() => {
      const open = this.lotId() !== null;
      untracked(() => (open ? this.show() : this.hide()));
    });
    inject(DestroyRef).onDestroy(() => this.unlock());
  }

  /**
   * Cerrar, Escape o un toque en el fondo: si la app sumó la entrada al abrir, vuelve atrás
   * (adelante lo reabre); si se llegó por un enlace pegado, saca el lote de la dirección
   */
  protected close(): void {
    if (this.lotId() === null || this.closing) return;
    this.closing = true;
    // si la vuelta no llega a cerrarlo (una navegación cancelada), Cerrar vuelve a andar
    setTimeout(() => (this.closing = false), 1000);
    if (this.openedByApp()) {
      this.location.back();
      return;
    }
    void this.router.navigate([], {
      queryParams: lotDialogParams(null),
      queryParamsHandling: 'merge',
      replaceUrl: true,
      scroll: 'manual',
    });
  }

  /** otra pestaña: reemplaza la dirección (atrás sigue cerrando el popup) */
  protected selectTab({ tab, params }: LotTabChange): void {
    const id = this.lotId();
    if (id === null) return;
    void this.router.navigate([], {
      queryParams: {
        [LOT_INNER_PARAM]: null,
        ...params,
        [LOT_PARAM]: id,
        [LOT_TAB_PARAM]: tab === 'satellite' ? null : LOT_TAB_SLUGS[tab],
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      scroll: 'manual',
      state: this.openedByApp() ? { [LOT_DIALOG_STATE]: true } : undefined,
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** el navegador lo cerró por su cuenta (un Escape que no se pudo frenar): se cierra igual */
  protected onNativeClose(): void {
    if (this.lotId() !== null && !this.closing) this.close();
  }

  /**
   * un toque en el fondo atenuado cierra: el fondo es el propio <dialog>, sin relleno. con una
   * ayuda (i) o el menú ⋯ abiertos, ese toque solo los cierra a ellos
   */
  protected onPointerDown(event: Event): void {
    const dialog = this.dialogEl().nativeElement;
    this.pressedBackdrop = event.target === dialog && !this.overlayOpen(dialog);
  }

  /** una ayuda (i) o el menú ⋯ abiertos adentro del popup */
  private overlayOpen(dialog: HTMLElement): boolean {
    if (dialog.querySelector('app-more-menu.is-open')) return true;
    try {
      return dialog.querySelector('[popover]:popover-open') !== null;
    } catch {
      // un navegador sin popover no entiende :popover-open: ahí la ayuda no flota
      return false;
    }
  }

  protected onBackdropClick(event: Event): void {
    const backdrop = this.pressedBackdrop && event.target === this.dialogEl().nativeElement;
    this.pressedBackdrop = false;
    if (backdrop) this.close();
  }

  /** con un menú abierto adentro, Escape cierra el menú y no el popup */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (this.dialogEl().nativeElement.querySelector('app-more-menu.is-open')) {
      event.preventDefault();
    }
  }

  private openedByApp(): boolean {
    const state = this.location.getState() as Record<string, unknown> | null;
    return state?.[LOT_DIALOG_STATE] === true;
  }

  private show(): void {
    this.closing = false;
    const dialog = this.dialogEl().nativeElement;
    if (dialog.open || dialog.hasAttribute('open')) return;
    const active = this.document.activeElement;
    this.opener = active instanceof HTMLElement && active !== this.document.body ? active : null;
    this.lock();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  private hide(): void {
    this.closing = false;
    const dialog = this.dialogEl().nativeElement;
    if (dialog.open || dialog.hasAttribute('open')) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    this.unlock();
    const opener = this.opener;
    this.opener = null;
    const focused = this.document.activeElement;
    if (opener?.isConnected && (!focused || focused === this.document.body)) {
      opener.focus({ preventScroll: true });
    }
  }

  /**
   * la pantalla de atrás no se desplaza mientras el popup está abierto. si tenía barra de
   * desplazamiento, se le guarda el lugar: nada se corre de costado al abrir
   */
  private lock(): void {
    if (this.locked) return;
    const root = this.document.documentElement;
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
