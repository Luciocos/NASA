import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Params, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { Api } from '../../../core/api';
import { EventLogItem, LandUseDeclaration, LotDetail } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  LotTabChange,
  LotTabKey,
  LotTabs,
  lotTabFromPath,
  lotTabs,
} from '../../../shared/ui/lot-tabs/lot-tabs';
import { FertilizationPage } from '../../fertilization/fertilization-page';
import { WaterPage } from '../../water/water-page';
import { FootprintPage } from '../../footprint/footprint-page/footprint-page';
import { ProfitPage } from '../../profit/profit-page/profit-page';
import { LotLog } from '../lot-log/lot-log';
import { LotNasa } from '../lot-nasa/lot-nasa';
import { LotPractices } from '../lot-practices/lot-practices';
import { LotLoadError, LotStatus } from './lot-status';

/** otra pestaña pedida desde el popup: la fila de pestañas o un enlace del contenido */
export type { LotTabChange } from '../../../shared/ui/lot-tabs/lot-tabs';

/**
 * el espacio de un lote: su encabezado (nombre, superficie, lugar, la marca de ejemplo y el
 * menú ⋯) con la fila de pestañas, y el contenido de la pestaña abierta. sirve en el popup del
 * lote (`mode="dialog"`: el encabezado queda fijo y el contenido se desplaza adentro) y como
 * página en las rutas del lote (`mode="page"`)
 *
 * pide la ficha una vez por lote y se la pasa a cada pestaña, que carga su código y sus datos
 * recién al abrirla. lo que una pestaña escribe vuelve a la ficha (la declaración de uso del
 * suelo, el rinde declarado en la huella, un evento revisado), así al volver a otra pestaña no
 * se ve lo de antes. en el popup, un enlace del contenido a otra pestaña de este lote (por
 * ejemplo, de la huella a Prácticas) cambia de pestaña sin salir del popup, y el foco pasa a la
 * pestaña abierta. un lote que no existe o es de otra cuenta (404) muestra la invitación a
 * ingresar
 *
 * @example
 * <app-lot-workspace mode="dialog" [lotId]="12" tab="footprint" (tabChange)="…" (closed)="…" />
 */
@Component({
  selector: 'app-lot-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Icon,
    LotTabs,
    LotStatus,
    LotNasa,
    LotLog,
    LotPractices,
    FootprintPage,
    FertilizationPage,
    WaterPage,
    ProfitPage,
  ],
  host: { '[class.is-dialog]': 'dialog()' },
  template: `
    @if (lot(); as lot) {
      <app-lot-tabs
        [lotId]="lot.id"
        [lot]="lot"
        [mode]="mode()"
        [active]="tab()"
        [panelId]="panelId()"
        (tabChange)="tabChange.emit({ tab: $event })"
        (closed)="closed.emit()"
      />
      <div
        class="lot-body"
        [id]="panelId()"
        [attr.role]="dialog() ? 'tabpanel' : null"
        [attr.aria-labelledby]="dialog() ? tabId() : null"
        [attr.tabindex]="dialog() ? 0 : null"
      >
        @switch (tab()) {
          @case ('log') {
            @defer (on immediate) {
              <app-lot-log [lot]="lot" [editable]="editable()" (reviewed)="onReviewed($event)" />
            } @placeholder {
              <div class="skeleton tab-skeleton" aria-hidden="true"></div>
            }
          }
          @case ('practices') {
            @defer (on immediate) {
              <app-lot-practices
                [lot]="lot"
                [editable]="editable()"
                [refresh]="attempt()"
                (openTab)="openTab($event)"
                (declared)="onLandUseDeclared($event)"
              />
            } @placeholder {
              <div class="skeleton tab-skeleton" aria-hidden="true"></div>
            }
          }
          @case ('footprint') {
            @defer (on immediate) {
              <app-footprint-page
                [lotId]="lot.id"
                [lotDetail]="lot"
                [embedded]="true"
                (openTab)="openTab({ tab: $event })"
                (declared)="refreshLot()"
              />
            } @placeholder {
              <div class="skeleton tab-skeleton" aria-hidden="true"></div>
            }
          }
          @case ('fertilization') {
            @defer (on immediate) {
              <app-fertilization-page [id]="lot.id" [lotDetail]="lot" [embedded]="true" />
            } @placeholder {
              <div class="skeleton tab-skeleton" aria-hidden="true"></div>
            }
          }
          @case ('water') {
            @defer (on immediate) {
              <app-water-page [id]="lot.id" [embedded]="true" />
            } @placeholder {
              <div class="skeleton tab-skeleton" aria-hidden="true"></div>
            }
          }
          @case ('profit') {
            @defer (on immediate) {
              <app-profit-page [id]="lot.id" [lotDetail]="lot" [embedded]="true" />
            } @placeholder {
              <div class="skeleton tab-skeleton" aria-hidden="true"></div>
            }
          }
          @default {
            @defer (on immediate) {
              <app-lot-nasa [lot]="lot" [events]="events()" />
            } @placeholder {
              <div class="skeleton tab-skeleton" aria-hidden="true"></div>
            }
          }
        }
      </div>
    } @else {
      @if (dialog()) {
        <div class="bare-head">
          <!-- el nombre del popup hasta que llega la ficha -->
          <h2 class="visually-hidden" [id]="'lot-title-' + lotId()">Lote</h2>
          <button type="button" class="btn btn--ghost btn--icon" (click)="closed.emit()">
            <app-icon name="close" /><span class="visually-hidden">Cerrar</span>
          </button>
        </div>
      }
      <div class="lot-body">
        <app-lot-status [error]="error()" [dialog]="dialog()" (retry)="reload()" />
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .tab-skeleton {
      height: 24rem;
      border-radius: var(--radius-lg);
    }

    /*
     * en el popup: encabezado y pestañas arriba, fijos, y el contenido se desplaza adentro sin
     * arrastrar la pantalla de atrás. --page-pad pasa a ser el margen del popup: lo que en una
     * página va de borde a borde (pistas deslizables) hace lo mismo acá
     */
    :host(.is-dialog) {
      --lot-pad: var(--space-6);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    :host(.is-dialog) .lot-body {
      --page-pad: var(--lot-pad);
      flex: 1;
      min-height: 0;
      padding: var(--space-5) var(--lot-pad) var(--space-6);
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }
    :host(.is-dialog) .lot-body:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
    .bare-head {
      display: flex;
      justify-content: flex-end;
      padding: var(--space-3) var(--space-3) 0;
    }
    @media (max-width: 40rem) {
      :host(.is-dialog) {
        --lot-pad: var(--space-4);
      }
      :host(.is-dialog) .lot-body {
        padding-top: var(--space-4);
        padding-bottom: calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
      }
      .tab-skeleton {
        height: 18rem;
      }
    }
  `,
})
export class LotWorkspace {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly lotId = input.required<number>();
  readonly tab = input<LotTabKey>('satellite');
  /** `dialog` adentro del popup; `page` en las rutas del lote */
  readonly mode = input<'page' | 'dialog'>('page');
  /** en el popup: la persona pidió otra pestaña (la dirección la cambia quien abrió el popup) */
  readonly tabChange = output<LotTabChange>();
  /** en el popup: la persona tocó Cerrar */
  readonly closed = output<void>();

  protected readonly dialog = computed(() => this.mode() === 'dialog');
  protected readonly lot = signal<LotDetail | null>(null);
  protected readonly error = signal<LotLoadError | null>(null);
  /** sube con cada reintento: lo que dependa del lote vuelve a pedirse */
  protected readonly attempt = signal(0);
  /** solo en un lote propio se ofrecen las acciones que escriben; un ejemplo no es de nadie */
  protected readonly editable = computed(
    () => this.lot()?.owned === true && this.lot()?.is_example !== true,
  );
  protected readonly panelId = computed(() => `lot-panel-${this.lotId()}`);
  protected readonly tabId = computed(() => `lot-tab-${this.lotId()}-${this.tab()}`);

  /** eventos de la bitácora para marcarlos en el verdor: los pide solo la pestaña Satélite */
  protected readonly events = signal<EventLogItem[]>([]);
  private eventsOf: number | null = null;
  /** la ficha que se vuelve a pedir sin esqueleto, después de que una pestaña la cambió */
  private refreshing: Subscription | null = null;

  constructor() {
    effect((onCleanup) => {
      const id = this.lotId();
      this.attempt();
      this.refreshing?.unsubscribe();
      untracked(() => {
        this.lot.set(null);
        this.error.set(null);
      });
      if (!Number.isInteger(id)) {
        this.error.set('not-found');
        return;
      }
      const subscription = this.api.lot(id).subscribe({
        next: (value) => this.lot.set(value),
        error: (failure: { status?: number }) =>
          this.error.set(failure.status === 404 ? 'not-found' : 'failed'),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    effect((onCleanup) => {
      const lot = this.lot();
      if (!lot || this.tab() !== 'satellite' || this.eventsOf === lot.id) return;
      const subscription = this.api.lotEvents(lot.id).subscribe({
        next: (log) => {
          this.eventsOf = lot.id;
          this.events.set(log.events);
        },
        // sin la bitácora, el verdor va sin marcas
        error: () => this.events.set([]),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    // en el popup, al llegar la ficha se reemplaza el Cerrar del esqueleto: si el foco estaba ahí
    // (showModal lo pone en el primer botón), pasa a la pestaña abierta en vez de perderse
    effect(() => {
      if (!this.lot() || !untracked(this.dialog)) return;
      afterNextRender(
        () => {
          const focused = this.document.activeElement;
          const host = this.host.nativeElement;
          if (focused && focused !== this.document.body && host.contains(focused)) return;
          if (!host.closest('dialog[open]')) return;
          host
            .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
            ?.focus({ preventScroll: true });
        },
        { injector: this.injector },
      );
    });

    // al cambiar de pestaña en el popup, el contenido nuevo arranca desde arriba. si la pidió un
    // enlace del contenido, ese enlace ya no está y el foco cayó fuera del popup: pasa a la
    // pestaña abierta, así el lector de pantalla la nombra y Tab sigue por su contenido
    effect(() => {
      this.tab();
      if (!untracked(this.dialog)) return;
      afterNextRender(
        () => {
          const host = this.host.nativeElement;
          const panel = host.querySelector<HTMLElement>('.lot-body');
          if (panel) panel.scrollTop = 0;
          const focused = this.document.activeElement;
          if (focused && focused !== this.document.body && host.contains(focused)) return;
          if (!host.closest('dialog[open]')) return;
          host
            .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
            ?.focus({ preventScroll: true });
        },
        { injector: this.injector },
      );
    });

    // un enlace del contenido a otra pestaña de este lote cambia de pestaña adentro del popup.
    // escucha en captura: corre antes que el routerLink del enlace
    const host = this.host.nativeElement;
    const onClick = (event: MouseEvent) => this.keepLinkInDialog(event);
    host.addEventListener('click', onClick, true);
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('click', onClick, true);
      this.refreshing?.unsubscribe();
    });
  }

  protected reload(): void {
    this.attempt.update((value) => value + 1);
  }

  /** la declaración de uso del suelo recién guardada en Prácticas pasa a la ficha */
  protected onLandUseDeclared(declaration: LandUseDeclaration): void {
    this.lot.update((lot) => lot && { ...lot, land_use_declaration: declaration });
  }

  /**
   * una pestaña cambió la ficha en el backend (el rinde declarado en la huella cambia las
   * campañas de la bitácora): se vuelve a pedir sin esqueleto. si falla, queda la que se ve
   */
  protected refreshLot(): void {
    const id = this.lotId();
    this.refreshing?.unsubscribe();
    this.refreshing = this.api.lot(id).subscribe({
      next: (lot) => {
        if (lot.id === this.lotId()) this.lot.set(lot);
      },
      error: () => undefined,
    });
  }

  /** un evento confirmado o corregido en la bitácora: las marcas del verdor lo muestran así */
  protected onReviewed(updated: EventLogItem): void {
    this.events.update((events) =>
      events.map((event) => (event.id === updated.id ? updated : event)),
    );
  }

  /**
   * una pestaña pedida desde el contenido (por ejemplo, una recomendación de Prácticas): en el
   * popup cambia de pestaña sin salir; como página, va a la ruta de esa pestaña
   */
  protected openTab(change: LotTabChange): void {
    if (this.dialog()) {
      this.tabChange.emit(change);
      return;
    }
    const tab = lotTabs(this.lotId()).find((item) => item.key === change.tab);
    if (tab) void this.router.navigate([tab.path], { queryParams: change.params });
  }

  private keepLinkInDialog(event: MouseEvent): void {
    if (!this.dialog() || event.defaultPrevented || event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = event.target as Element | null;
    const anchor = target?.closest<HTMLAnchorElement>('a[href]') ?? null;
    if (
      !anchor ||
      (anchor.target && anchor.target !== '_self') ||
      anchor.hasAttribute('download')
    ) {
      return;
    }
    const url = new URL(anchor.href, this.document.baseURI);
    if (url.origin !== new URL(this.document.baseURI).origin) return;
    const tab = lotTabFromPath(url.pathname, this.lotId());
    if (!tab) return;
    event.preventDefault();
    event.stopPropagation();
    const params: Params = {};
    url.searchParams.forEach((value, key) => (params[key] = value));
    this.tabChange.emit({ tab, params });
  }
}
