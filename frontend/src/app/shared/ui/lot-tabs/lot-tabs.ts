import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  PendingTasks,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router, RouterLink } from '@angular/router';
import { filter, firstValueFrom, map } from 'rxjs';

import { Api } from '../../../core/api';
import { formatHectares } from '../../../core/insights';
import { LotDetail, LotSummary } from '../../../core/models';
import { OriginBadge } from '../../origin-badge/origin-badge';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';
import { HelpButton } from '../../../features/help/help-button/help-button';
import { MoreMenu } from '../more-menu/more-menu';

export type LotTabKey =
  'satellite' | 'log' | 'practices' | 'footprint' | 'fertilization' | 'profit' | 'water';

/** otra pestaña del lote pedida desde su contenido: la clave y, si hace falta, la consulta de su vista */
export interface LotTabChange {
  tab: LotTabKey;
  /** la consulta del enlace que la pidió (por ejemplo, la vista de la huella) */
  params?: Params;
}

export interface LotTab {
  key: LotTabKey;
  label: string;
  icon: IconName;
  /** ruta absoluta de la pestaña */
  path: string;
}

/** las pestañas del lote, en el orden de la fila */
export function lotTabs(lotId: number): LotTab[] {
  return [
    { key: 'satellite', label: 'Satélite', icon: 'satellite', path: `/lotes/${lotId}` },
    { key: 'log', label: 'Bitácora', icon: 'calendar', path: `/lotes/${lotId}/bitacora` },
    { key: 'practices', label: 'Prácticas', icon: 'check', path: `/lotes/${lotId}/practicas` },
    { key: 'footprint', label: 'Huella', icon: 'footprint', path: `/huella/${lotId}` },
    {
      key: 'fertilization',
      label: 'Fertilización',
      icon: 'leaf',
      path: `/lotes/${lotId}/fertilizacion`,
    },
    { key: 'profit', label: 'Rentabilidad', icon: 'coins', path: `/lotes/${lotId}/rentabilidad` },
    { key: 'water', label: 'Cuenca y Caudal', icon: 'water', path: `/lotes/${lotId}/cuenca` },
  ];
}

/**
 * la pestaña en la dirección del popup del lote (?seccion=huella): el mismo nombre que su ruta.
 * Satélite es la de entrada y no se escribe
 */
export const LOT_TAB_SLUGS: Record<LotTabKey, string> = {
  satellite: 'satelite',
  log: 'bitacora',
  practices: 'practicas',
  footprint: 'huella',
  fertilization: 'fertilizacion',
  profit: 'rentabilidad',
  water: 'cuenca',
};

/** la pestaña de un nombre de la dirección; cualquier otro valor abre Satélite */
export function lotTabFromSlug(slug: string | null | undefined): LotTabKey {
  const found = Object.entries(LOT_TAB_SLUGS).find(([, value]) => value === slug);
  return (found?.[0] as LotTabKey | undefined) ?? 'satellite';
}

/** la pestaña a la que lleva una ruta de este lote ("/huella/7"), o null si es otra cosa */
export function lotTabFromPath(path: string, lotId: number): LotTabKey | null {
  const clean = pathOf(path);
  return lotTabs(lotId).find((tab) => tab.path === clean)?.key ?? null;
}

/** lo que pasó al compartir el pasaporte: copiado, para copiar a mano o con error */
type ShareState =
  | { status: 'copied' | 'manual'; url: string; path: string }
  | { status: 'error'; url?: undefined; path?: undefined };

/** la ruta sin consulta, fragmento, parámetros de matriz ni barra final */
function pathOf(url: string): string {
  return url.split(/[?#;]/)[0].replace(/\/+$/, '') || '/';
}

/**
 * encabezado y pestañas de un lote, iguales en todas sus pantallas: el nombre con su superficie
 * y su lugar, la marca de ejemplo de solo lectura y un menú ⋯ con lo poco frecuente (en un lote
 * propio, compartir el pasaporte). debajo, una sola fila de pestañas: Satélite, Bitácora,
 * Prácticas, Huella, Fertilización, Rentabilidad y Cuenca y Caudal
 *
 * dos modos:
 * - `page` (el de siempre, en las rutas del lote): suma la vuelta a Mi campo (o a Ejemplos) y
 *   las pestañas son enlaces a cada ruta, con aria-current="page". al bajar, la fila queda
 *   pegada arriba (debajo de la barra de la app) y el encabezado se va
 * - `dialog` (en el popup del lote): sin la vuelta y con el botón Cerrar al final del
 *   encabezado. las pestañas son pestañas de verdad (role="tab", flechas, Inicio y Fin) y
 *   avisan con `tabChange`; quien abre el popup cambia la dirección
 *
 * en el celular la fila se desliza de costado con la pestaña activa a la vista. la raya de la
 * activa pasa de una pestaña a otra con la transición de vista del router (que se saltea con
 * prefers-reduced-motion). sin `lot` muestra solo la vuelta y las pestañas
 *
 * @example <app-lot-tabs [lotId]="lot.id" [example]="lot.is_example" [lot]="lot" />
 * @example
 * <app-lot-tabs mode="dialog" [lotId]="lot.id" [lot]="lot" [active]="tab" panelId="lot-panel"
 *   (tabChange)="select($event)" (closed)="close()" />
 */
@Component({
  selector: 'app-lot-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, MoreMenu, OriginBadge, HelpButton],
  host: {
    '[class.is-stuck]': 'stuck()',
    '[class.is-dialog]': 'dialog()',
    '[style.--lot-head-h]': 'headHeight() + "px"',
  },
  template: `
    <div #head class="head">
      @if (!dialog()) {
        <a class="back" [routerLink]="isExample() ? '/ejemplos' : '/mapa'"
          ><app-icon name="arrow-left" />{{ isExample() ? 'Ejemplos' : 'Mi campo' }}</a
        >
      }
      @if (lot(); as l) {
        <div class="row">
          <div class="title" [class.vt-lot-hero]="!dialog()">
            @if (dialog()) {
              <h2 class="name" [id]="'lot-title-' + l.id">{{ l.name }}</h2>
            } @else {
              <h1 class="name" [id]="'lot-title-' + l.id">{{ l.name }}</h1>
            }
            @if (meta(); as metaText) {
              <p class="meta">{{ metaText }}</p>
            }
            @if (isExample()) {
              <span class="chip chip--accent example"
                ><app-icon name="eye" /> Lote de ejemplo · solo lectura</span
              >
            }
          </div>
          <!-- la guía con imágenes para cargar datos, abierta en el paso de la pestaña -->
          <app-help-button class="help" [step]="active()" />
          @if (canShare()) {
            <app-more-menu class="more" label="Más opciones del lote">
              @if (l.renspa) {
                <!-- lo cargó el productor al marcar el lote: a mano, sin sumarlo al encabezado -->
                <p class="menu-note">
                  RENSPA {{ l.renspa }} <app-origin-badge origin="DECLARED" />
                </p>
              }
              <button
                type="button"
                class="menu-item"
                data-keep-open
                [attr.aria-disabled]="sharing() || null"
                (click)="sharePassport()"
              >
                <app-icon name="passport" />
                {{ sharing() ? 'Generando el enlace…' : 'Compartir pasaporte' }}
              </button>
              <div class="share" aria-live="polite">
                @if (share(); as s) {
                  @if (s.status === 'error') {
                    <p class="share__msg share__msg--error" role="alert">
                      <app-icon name="alert" /> No se pudo generar el pasaporte. Probá de nuevo en
                      un rato.
                    </p>
                  } @else {
                    @if (s.status === 'copied') {
                      <p class="share__msg">
                        <app-icon name="check" /> Enlace copiado. Pegalo en un mensaje para
                        compartir el pasaporte.
                      </p>
                    } @else {
                      <p class="share__msg">No se pudo copiar solo. Copiá el enlace:</p>
                      <input
                        class="share__url"
                        type="text"
                        readonly
                        aria-label="Enlace del pasaporte"
                        [value]="s.url"
                        (focus)="selectAll($event)"
                      />
                    }
                    <a class="menu-item" [routerLink]="s.path"
                      ><app-icon name="link" /> Abrir el pasaporte</a
                    >
                  }
                }
              </div>
            </app-more-menu>
          }
          @if (dialog()) {
            <button type="button" class="btn btn--ghost btn--icon close" (click)="closed.emit()">
              <app-icon name="close" /><span class="visually-hidden">Cerrar</span>
            </button>
          }
        </div>
      }
    </div>

    @if (dialog()) {
      <div #nav class="nav">
        <div
          #track
          class="track"
          role="tablist"
          aria-label="Secciones del lote"
          [class.fade-start]="fadeStart()"
          [class.fade-end]="fadeEnd()"
          (scroll)="syncTrack()"
        >
          @for (tab of tabs(); track tab.key) {
            <button
              type="button"
              role="tab"
              class="tab"
              [id]="tabId(tab.key)"
              [class.is-active]="tab.key === current()"
              [attr.aria-selected]="tab.key === current()"
              [attr.aria-controls]="panelId()"
              [tabIndex]="tab.key === current() ? 0 : -1"
              (click)="select(tab.key)"
              (keydown)="onTabKey($event)"
            >
              <app-icon [name]="tab.icon" /><span class="label" [attr.data-label]="tab.label">{{
                tab.label
              }}</span>
              @if (tab.key === current()) {
                <span class="indicator" aria-hidden="true"></span>
              }
            </button>
          }
        </div>
      </div>
    } @else {
      <nav #nav class="nav" aria-label="Secciones del lote">
        <div
          #track
          class="track"
          [class.fade-start]="fadeStart()"
          [class.fade-end]="fadeEnd()"
          (scroll)="syncTrack()"
        >
          @for (tab of tabs(); track tab.key) {
            <a
              class="tab"
              [routerLink]="tab.path"
              [class.is-active]="tab.key === current()"
              [attr.aria-current]="tab.key === current() ? 'page' : null"
              ><app-icon [name]="tab.icon" /><span class="label" [attr.data-label]="tab.label">{{
                tab.label
              }}</span>
              @if (tab.key === current()) {
                <span class="indicator" aria-hidden="true"></span>
              }
            </a>
          }
        </div>
      </nav>
    }
  `,
  styles: `
    /*
     * todo el componente se pega arriba, corrido hacia arriba lo que mide el encabezado: así
     * queda a la vista solo la fila de pestañas. --lot-head-h lo mide el componente
     */
    :host {
      --lot-sticky-top: 0px;
      position: sticky;
      top: calc(var(--lot-sticky-top) - var(--lot-head-h, 0px));
      /* encima de los mapas (Leaflet usa hasta 1000) y debajo de la barra de la app */
      z-index: calc(var(--z-topbar) - 1);
      display: block;
      min-width: 0;
      margin-bottom: var(--space-5);
      /* entre pestañas el encabezado queda quieto: solo cambia el contenido */
      view-transition-name: lot-header;
    }
    /* con la barra de la app fija (app.css), las pestañas se pegan debajo de ella */
    @media (min-width: 48rem) and (min-height: 30rem) {
      :host {
        --lot-sticky-top: var(--topbar-h);
      }
    }

    .head {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
      transition: opacity var(--dur-2) var(--ease-out);
    }
    /* pegado, el encabezado queda debajo de la barra translúcida: se apaga para no verse */
    :host(.is-stuck) .head {
      opacity: 0;
      pointer-events: none;
    }
    .back {
      --icon-size: 1rem;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      justify-self: start;
      min-height: var(--tap);
      /* toque de 44 px que a la vista ocupa una línea */
      margin: calc((1.5rem - var(--tap)) / 2) 0 calc((1.5rem - var(--tap)) / 2)
        calc(-1 * var(--space-2));
      padding: 0 var(--space-3) 0 var(--space-2);
      border-radius: var(--radius-pill);
      color: var(--link);
      font-size: var(--text-sm);
      font-weight: 600;
      text-decoration: none;
    }
    .back:hover {
      background: var(--paper-2);
    }
    .back:focus-visible,
    .tab:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-4);
      min-width: 0;
    }
    .title {
      display: flex;
      flex: 1 1 16rem;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-1) var(--space-3);
      min-width: 0;
    }
    .name {
      margin: 0;
      font-size: var(--text-2xl);
      overflow-wrap: anywhere;
    }
    .meta {
      margin: 0;
      color: var(--ink-2);
      font-size: var(--text-md);
    }
    .example {
      flex: none;
      align-self: center;
    }
    .help {
      flex: none;
      margin-left: auto;
      align-self: center;
    }
    .more {
      flex: none;
      margin-left: auto;
    }
    .help + .more {
      margin-left: 0;
    }
    .close {
      flex: none;
    }
    .more + .close {
      margin-left: calc(-1 * var(--space-3));
    }

    /* el resultado de compartir queda en el mismo menú, donde se pidió */
    .share:empty {
      display: none;
    }
    .share {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-1) 0;
      border-top: 1px solid var(--line);
      margin-top: var(--space-1);
    }
    .share__msg {
      --icon-size: 1rem;
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      margin: 0;
      padding: 0 var(--space-2);
      color: var(--ink-2);
      font-size: var(--text-sm);
      line-height: 1.4;
    }
    .menu-note {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-2);
      align-items: center;
      margin: 0;
      padding: var(--space-1) var(--space-2) var(--space-2);
      border-bottom: 1px solid var(--line);
      color: var(--ink-2);
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
    }
    .share__msg app-icon {
      flex: none;
      margin-top: 0.125rem;
      color: var(--ok);
    }
    .share__msg--error,
    .share__msg--error app-icon {
      color: var(--danger);
    }
    .share__url {
      width: 100%;
      min-height: var(--tap);
      padding: 0 var(--space-3);
      border: 1px solid var(--line-control);
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      color: var(--ink);
      font-size: var(--text-sm);
    }

    /* fila de pestañas: raya fina abajo y la activa con su raya verde */
    .nav {
      position: relative;
      margin-top: var(--space-3);
      background: var(--paper);
      box-shadow: inset 0 -1px var(--line);
      transition: box-shadow var(--dur-2) var(--ease-out);
    }
    :host(.is-stuck) .nav {
      box-shadow:
        inset 0 -1px var(--line),
        0 10px 16px -14px rgb(21 33 26 / 45%);
    }
    .track {
      position: relative;
      display: flex;
      gap: var(--space-1);
      min-width: 0;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
    }
    .track::-webkit-scrollbar {
      display: none;
    }
    /* si la fila no entra, el borde que sigue se esfuma: hay más pestañas de ese lado */
    .track.fade-end {
      mask-image: linear-gradient(to right, #000 calc(100% - 2.5rem), transparent);
    }
    .track.fade-start {
      mask-image: linear-gradient(to left, #000 calc(100% - 2.5rem), transparent);
    }
    .track.fade-start.fade-end {
      mask-image: linear-gradient(
        to right,
        transparent,
        #000 2.5rem,
        #000 calc(100% - 2.5rem),
        transparent
      );
    }
    .tab {
      --icon-size: 1.15rem;
      position: relative;
      display: inline-flex;
      flex: none;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--tap);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      color: var(--ink-3);
      font-size: var(--text-sm);
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      transition:
        color var(--dur-2) var(--ease-out),
        background-color var(--dur-2) var(--ease-out);
    }
    .tab:hover {
      background: var(--paper-2);
      color: var(--ink);
    }
    .tab.is-active {
      color: var(--ink);
    }
    .tab.is-active app-icon {
      color: var(--field-700);
    }
    .tab.is-active .label {
      font-weight: 700;
    }
    /* el rótulo reserva el ancho de la negrita: la fila no salta al cambiar de pestaña */
    .label {
      display: inline-grid;
    }
    .label::after {
      content: attr(data-label);
      content: attr(data-label) / '';
      height: 0;
      overflow: hidden;
      font-weight: 700;
      visibility: hidden;
      pointer-events: none;
      user-select: none;
    }
    /* la raya de la activa tiene nombre propio: la transición de vista la corre de lugar */
    .indicator {
      position: absolute;
      inset: auto var(--space-2) 0;
      height: 3px;
      border-radius: 3px 3px 0 0;
      background: var(--field-700);
      view-transition-name: lot-tab-indicator;
    }

    /*
     * en el popup el encabezado queda fijo arriba y lo que se desplaza es el contenido: sin
     * pegarse, sin la vuelta y con Cerrar al final. la fila de pestañas va de borde a borde
     */
    :host(.is-dialog) {
      position: relative;
      top: auto;
      z-index: 2;
      margin: 0;
      padding: var(--space-4) var(--lot-pad, var(--space-5)) 0;
      background: var(--paper);
      view-transition-name: none;
    }
    :host(.is-dialog) .row {
      flex-wrap: nowrap;
      align-items: flex-start;
    }
    :host(.is-dialog) .name {
      font-size: var(--text-xl);
    }
    :host(.is-dialog) .meta {
      font-size: var(--text-sm);
    }
    :host(.is-dialog) .nav {
      margin-inline: calc(-1 * var(--lot-pad, var(--space-5)));
    }
    :host(.is-dialog) .track {
      padding-inline: var(--lot-pad, var(--space-5));
      scroll-padding-inline: var(--lot-pad, var(--space-5));
    }
    :host(.is-dialog) .tab {
      border: 0;
      background: none;
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 600;
      cursor: pointer;
    }

    @media (max-width: 40rem) {
      :host {
        margin-bottom: var(--space-4);
      }
      .name {
        font-size: var(--text-xl);
      }
      :host(.is-dialog) .name {
        font-size: var(--text-lg);
      }
      .meta {
        font-size: var(--text-sm);
      }
      /* la fila va de borde a borde de la pantalla y se desliza con el dedo */
      :host(:not(.is-dialog)) .nav {
        margin-inline: calc(-1 * var(--page-pad, 1rem));
      }
      :host(:not(.is-dialog)) .track {
        padding-inline: var(--page-pad, 1rem);
        scroll-padding-inline: var(--page-pad, 1rem);
      }
      :host(.is-dialog) {
        margin: 0;
        padding-top: var(--space-3);
      }
    }
  `,
})
export class LotTabs {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pendingTasks = inject(PendingTasks);

  private readonly injector = inject(Injector);

  readonly lotId = input.required<number>();
  /** lote de ejemplo: la vuelta lleva a Ejemplos en vez de a Mi campo */
  readonly example = input(false, { transform: booleanAttribute });
  /** el lote, si ya llegó: suma al encabezado el nombre, la superficie, el lugar y el menú */
  readonly lot = input<LotSummary | LotDetail | null>(null);
  /** `page` en las rutas del lote; `dialog` adentro del popup */
  readonly mode = input<'page' | 'dialog'>('page');
  /** la pestaña abierta; en una página, si falta, sale de la dirección */
  readonly active = input<LotTabKey | null>(null);
  /** id del panel que muestran las pestañas del popup (aria-controls) */
  readonly panelId = input<string | null>(null);
  /** en el popup: la persona eligió otra pestaña */
  readonly tabChange = output<LotTabKey>();
  /** en el popup: la persona tocó Cerrar */
  readonly closed = output<void>();

  protected readonly dialog = computed(() => this.mode() === 'dialog');

  protected readonly isExample = computed(() => this.lot()?.is_example ?? this.example());
  /** "55 ha · Casilda, Santa Fe": superficie del polígono y lugar, en una línea */
  protected readonly meta = computed(() => {
    const lot = this.lot();
    if (!lot) return '';
    const place = [lot.locality, lot.province].filter(Boolean).join(', ');
    return [formatHectares(lot.area_ha), place].filter(Boolean).join(' · ');
  });
  /** solo el dueño comparte el pasaporte; un ejemplo no es de nadie */
  protected readonly canShare = computed(() => this.lot()?.owned === true && !this.isExample());

  protected readonly tabs = computed(() => lotTabs(this.lotId()));
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => pathOf(event.urlAfterRedirects)),
    ),
    { initialValue: pathOf(this.router.url) },
  );
  protected readonly current = computed<LotTabKey | null>(
    () =>
      this.active() ??
      (this.dialog() ? 'satellite' : null) ??
      this.tabs().find((tab) => tab.path === this.path())?.key ??
      null,
  );

  private readonly headEl = viewChild.required<ElementRef<HTMLElement>>('head');
  private readonly navEl = viewChild.required<ElementRef<HTMLElement>>('nav');
  private readonly trackEl = viewChild.required<ElementRef<HTMLElement>>('track');
  /** lo que mide el encabezado hasta la fila de pestañas: lo que se corre al pegarse */
  protected readonly headHeight = signal(0);
  /** la fila quedó pegada arriba: el encabezado se apaga y la fila suma una sombra */
  protected readonly stuck = signal(false);
  protected readonly fadeStart = signal(false);
  protected readonly fadeEnd = signal(false);

  protected readonly sharing = signal(false);
  protected readonly share = signal<ShareState | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // la pestaña activa queda a la vista en la fila, también al cambiarla desde el popup
    effect(() => {
      this.current();
      afterNextRender(() => this.revealActive(), { injector: this.injector });
    });
    afterNextRender(() => {
      const view = this.document.defaultView;
      const host = this.host.nativeElement;
      const track = this.trackEl().nativeElement;
      const measure = () =>
        this.headHeight.set(this.dialog() ? 0 : this.navEl().nativeElement.offsetTop);
      measure();
      this.syncTrack();
      // al girar el celular o cambiar el ancho de la ventana (también en el popup), la fila
      // vuelve a marcar sus bordes y, si cambió de ancho, a centrar la pestaña abierta
      let width = track.clientWidth;
      const resize =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(() => {
              measure();
              this.syncTrack();
              if (track.clientWidth === width) return;
              width = track.clientWidth;
              this.revealActive();
            });
      resize?.observe(track);
      destroyRef.onDestroy(() => resize?.disconnect());
      // en el popup no se pega nada: el que se desplaza es el contenido
      if (!view || this.dialog()) return;

      resize?.observe(this.headEl().nativeElement);
      let frame = 0;
      const checkStuck = () => {
        frame = 0;
        const top = parseFloat(view.getComputedStyle(host).top) || 0;
        this.stuck.set(view.scrollY > 0 && host.getBoundingClientRect().top <= top + 0.5);
      };
      const onScroll = () => {
        if (!frame) frame = view.requestAnimationFrame(checkStuck);
      };
      view.addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        view.removeEventListener('scroll', onScroll);
        if (frame) view.cancelAnimationFrame(frame);
      });
    });
  }

  /** marca qué bordes de la fila tienen más pestañas para deslizar */
  protected syncTrack(): void {
    const track = this.trackEl().nativeElement;
    const max = track.scrollWidth - track.clientWidth;
    this.fadeStart.set(track.scrollLeft > 1);
    this.fadeEnd.set(track.scrollLeft < max - 1);
  }

  /** id de cada pestaña del popup: el panel lo usa como nombre (aria-labelledby) */
  tabId(key: LotTabKey): string {
    return `lot-tab-${this.lotId()}-${key}`;
  }

  protected select(key: LotTabKey): void {
    if (key !== this.current()) this.tabChange.emit(key);
  }

  /** flechas, Inicio y Fin recorren las pestañas del popup y abren la que queda con el foco */
  protected onTabKey(event: KeyboardEvent): void {
    const keys = this.tabs().map((tab) => tab.key);
    const index = Math.max(0, keys.indexOf(this.current() ?? 'satellite'));
    const target: Record<string, number> = {
      ArrowRight: (index + 1) % keys.length,
      ArrowLeft: (index - 1 + keys.length) % keys.length,
      Home: 0,
      End: keys.length - 1,
    };
    const next = target[event.key];
    if (next === undefined) return;
    event.preventDefault();
    this.select(keys[next]);
    this.host.nativeElement.querySelector<HTMLElement>(`#${this.tabId(keys[next])}`)?.focus();
  }

  /** deja la pestaña activa en el centro de la fila, sin animación */
  private revealActive(): void {
    const track = this.trackEl().nativeElement;
    const tab = track.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
    if (!tab || track.scrollWidth <= track.clientWidth) return;
    track.scrollLeft = Math.max(0, tab.offsetLeft - (track.clientWidth - tab.offsetWidth) / 2);
  }

  /**
   * genera el enlace público del pasaporte y lo copia. el pedido al portapapeles sale en el
   * mismo toque (Safari lo exige) y el texto llega cuando responde el backend. si el navegador
   * no deja copiar, el enlace queda a la vista para copiarlo a mano
   */
  protected sharePassport(): void {
    const lot = this.lot();
    if (!lot || !this.canShare() || this.sharing()) return;
    // la app no está estable hasta que termina: las pruebas y el render esperan el resultado
    const done = this.pendingTasks.add();
    const known = this.share();
    if (known?.url) {
      const { url, path } = known;
      void this.copy(Promise.resolve(url))
        .then((copied) => this.share.set({ status: copied ? 'copied' : 'manual', url, path }))
        .finally(done);
      return;
    }
    this.sharing.set(true);
    this.share.set(null);
    const link = firstValueFrom(this.api.createPassport(lot.id)).then((passport) => ({
      path: passport.url,
      url: new URL(passport.url, this.document.baseURI).href,
    }));
    const url = link.then((value) => value.url);
    // si el pedido falla, el error se informa una sola vez, abajo
    url.catch(() => undefined);
    const copied = this.copy(url);
    link
      .then(
        async (value) => this.share.set({ status: (await copied) ? 'copied' : 'manual', ...value }),
        () => this.share.set({ status: 'error' }),
      )
      .finally(() => {
        this.sharing.set(false);
        done();
      });
  }

  protected selectAll(event: Event): void {
    (event.target as HTMLInputElement | null)?.select();
  }

  private async copy(text: Promise<string>): Promise<boolean> {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard) return false;
    try {
      if (typeof ClipboardItem === 'undefined' || !clipboard.write) throw new Error('sin write');
      const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
      await clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    } catch {
      try {
        await clipboard.writeText(await text);
        return true;
      } catch {
        return false;
      }
    }
  }
}
