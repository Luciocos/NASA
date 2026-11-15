import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { outputFromObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router';
import { Subject, map } from 'rxjs';

import { Api } from '../../../core/api';
import { Footprint, LotDetail } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoginInvite } from '../../../shared/ui/login-invite/login-invite';
import { LotTabKey, LotTabs } from '../../../shared/ui/lot-tabs/lot-tabs';
import { DeclarationForm } from '../declaration-form/declaration-form';
import { FootprintComponents } from '../footprint-components/footprint-components';
import { FootprintOverview } from '../footprint-overview/footprint-overview';
import { FootprintSummary } from '../footprint-summary/footprint-summary';
import { plainError } from '../format';
import { Simulator } from '../simulator/simulator';

/**
 * vistas de la huella, una por vez; se enlazan con ?vista=, como página (/huella/3?vista=desglose)
 * y en el popup del lote (/mapa?lote=3&seccion=huella&vista=desglose: el popup reserva `vista`
 * para la vista interna de la huella y la limpia al cambiar de pestaña o cerrar)
 */
export type FootprintView = 'resumen' | 'desglose' | 'simulador' | 'datos';

const VIEWS: readonly { id: FootprintView; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'desglose', label: 'Desglose' },
  { id: 'simulador', label: 'Simulador' },
  { id: 'datos', label: 'Tus datos' },
];

function parseView(value: string | null): FootprintView | null {
  return VIEWS.find((view) => view.id === value)?.id ?? null;
}

/**
 * id del lote que llega por input: un número, o el texto del parámetro de la ruta si el router
 * enlaza parámetros con inputs (withComponentInputBinding). vacío = se toma de la ruta
 */
function toLotId(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return Number(value);
}

/**
 * Huella estimada y simulador (CLAUDE.md, sección 11, pantallas 4 y 5). Arriba, una tarjeta chica
 * con el resultado, lo que falta y la acción principal; debajo, una vista por vez (Resumen,
 * Desglose, Simulador y, en un lote propio, Tus datos). El puntaje vive en la pestaña Prácticas.
 *
 * Sirve como página (/huella/:lotId, con su encabezado y pestañas del lote) y adentro del popup
 * del lote: `<app-footprint-page [lotId]="id" embedded (openTab)="..." />`. Embebida no muestra
 * app-lot-tabs, baja sus títulos a h3 y cambia de vista sin sumar pasos al historial.
 */
@Component({
  imports: [
    DeclarationForm,
    FootprintComponents,
    FootprintOverview,
    FootprintSummary,
    Icon,
    LoginInvite,
    LotTabs,
    Simulator,
  ],
  selector: 'app-footprint-page',
  host: { '[class.is-embedded]': 'embedded()' },
  styleUrl: './footprint-page.css',
  templateUrl: './footprint-page.html',
})
export class FootprintPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  /** id del lote; si no llega, sale del parámetro :lotId de la ruta */
  readonly lotId = input<number | undefined, unknown>(undefined, { transform: toLotId });
  /** adentro del popup del lote: sin app-lot-tabs y sin tocar la URL */
  readonly embedded = input(false, { transform: booleanAttribute });
  /** la ficha del lote, si quien la muestra ya la tiene (el popup): no se vuelve a pedir */
  readonly lotDetail = input<LotDetail | null>(null);
  /** se guardó una declaración: el backend recalculó la huella y cambió la ficha del lote */
  readonly declared = output<Footprint>();

  private readonly tabRequests = new Subject<LotTabKey>();
  /**
   * pide al contenedor (el popup del lote) que muestre otra pestaña: hoy, 'practices' desde
   * "Ver puntaje y buenas prácticas". si nadie lo escucha, el enlace navega a la ruta de la pestaña
   */
  readonly openTab = outputFromObservable(this.tabRequests);

  private readonly routeLotId = toSignal(
    this.route.paramMap.pipe(map((params) => toLotId(params.get('lotId')))),
    { initialValue: undefined },
  );
  private readonly queryView = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('vista'))),
    { initialValue: null },
  );

  /** los títulos: h2 como página (debajo del h1 del lote); h3 en el popup, cuyo título es h2 */
  protected readonly level = computed<2 | 3>(() => (this.embedded() ? 3 : 2));

  /** el id en uso: el del input o el de la ruta (NaN si ninguno sirve) */
  protected readonly id = computed(() => this.lotId() ?? this.routeLotId() ?? NaN);

  protected readonly lot = signal<LotDetail | null>(null);
  /** Id de la campaña elegida; null usa la última del lote. Vuelve a null si cambia el lote. */
  protected readonly campaign = linkedSignal<number, number | null>({
    source: this.id,
    computation: () => null,
  });
  protected readonly footprint = signal<Footprint | null>(null);
  protected readonly footprintError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** El lote no existe o es de otra cuenta (404): se invita a ingresar. */
  protected readonly notFound = signal(false);
  /** "Reintentar" lo incrementa y vuelven a salir los pedidos */
  private readonly attempt = signal(0);

  /** en un lote de ejemplo no se declara (el backend responde 403) */
  protected readonly canDeclare = computed(() => {
    const lot = this.lot();
    return lot !== null && !lot.is_example;
  });
  protected readonly views = computed(() =>
    VIEWS.filter((view) => view.id !== 'datos' || this.canDeclare()),
  );
  /** la vista pedida: la del enlace, hasta que la persona elige otra */
  private readonly requested = linkedSignal(() => parseView(this.queryView()));
  protected readonly view = computed<FootprintView>(() => {
    const requested = this.requested();
    return this.views().find((view) => view.id === requested)?.id ?? 'resumen';
  });
  /** la ruta de la pestaña Prácticas del lote, para abrirla en otra pestaña o sin popup */
  protected readonly practicesHref = computed(() =>
    this.router.serializeUrl(this.router.createUrlTree(['/lotes', this.id(), 'practicas'])),
  );

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      this.attempt();
      const given = this.lotDetail();
      // otro lote (el popup puede reusar la pantalla): no queda a la vista el anterior
      if (untracked(this.lot)?.id !== id) this.lot.set(null);
      this.notFound.set(false);
      if (!Number.isInteger(id) || id <= 0) {
        this.error.set('Este enlace no lleva a ningún lote. Volvé a Mi campo y elegilo de nuevo.');
        return;
      }
      this.error.set(null);
      if (given?.id === id) {
        this.lot.set(given);
        return;
      }
      const subscription = this.api.lot(id).subscribe({
        next: (lot) => this.lot.set(lot),
        error: (error: HttpErrorResponse) => {
          if (error.status === 404) this.notFound.set(true);
          else this.error.set(plainError(error.status, 'este lote'));
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });

    effect((onCleanup) => {
      const id = this.id();
      const campaign = this.campaign();
      this.attempt();
      if (!Number.isInteger(id) || id <= 0) {
        return;
      }
      if (untracked(this.footprint)?.lot !== id) this.footprint.set(null);
      this.footprintError.set(null);
      const subscription = this.api.footprint(id, campaign).subscribe({
        next: (footprint) => this.footprint.set(footprint),
        error: (error: HttpErrorResponse) => {
          this.footprint.set(null);
          this.footprintError.set(plainError(error.status, 'la huella'));
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected retry(): void {
    this.attempt.update((n) => n + 1);
  }

  /** Tras declarar: muestra la huella recalculada de la campaña declarada. */
  protected onDeclared(footprint: Footprint): void {
    this.footprint.set(footprint);
    if (footprint.campaign?.id) this.campaign.set(footprint.campaign.id);
    this.declared.emit(footprint);
  }

  protected onCampaign(campaign: number | null): void {
    this.campaign.set(campaign);
  }

  /**
   * cambia de vista y la deja en el enlace, sin mover la pantalla. como página, con el mouse o el
   * dedo suma un paso al historial (atrás vuelve a la vista anterior) y con las flechas lo
   * reemplaza. en el popup siempre reemplaza, para que atrás siga cerrándolo, y conserva la marca
   * que el popup dejó en esa entrada del historial
   */
  protected select(view: FootprintView, replaceUrl = false): void {
    this.requested.set(view);
    const embedded = this.embedded();
    const state = embedded ? this.keptState() : undefined;
    const extras: NavigationExtras = {
      queryParams: { vista: view === 'resumen' ? null : view },
      queryParamsHandling: 'merge',
      replaceUrl: replaceUrl || embedded,
      scroll: 'manual',
      ...(state ? { state } : {}),
    };
    void this.router.navigate([], extras);
  }

  /** el estado propio de la entrada actual del historial, sin el número que pone el router */
  private keptState(): Record<string, unknown> | undefined {
    const current = (this.location.getState() ?? {}) as Record<string, unknown>;
    const kept = Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== 'navigationId'),
    );
    return Object.keys(kept).length > 0 ? kept : undefined;
  }

  /** flechas, Inicio y Fin recorren las vistas (patrón de pestañas con activación automática) */
  protected onTabKey(event: KeyboardEvent): void {
    const views = this.views();
    const current = views.findIndex((view) => view.id === this.view());
    const next =
      event.key === 'ArrowRight'
        ? (current + 1) % views.length
        : event.key === 'ArrowLeft'
          ? (current - 1 + views.length) % views.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? views.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    this.select(views[next].id, true);
    this.host.nativeElement.querySelector<HTMLElement>(`#huella-tab-${views[next].id}`)?.focus();
  }

  /** la acción principal: abre "Tus datos" y lleva el foco al formulario */
  protected openDeclaration(): void {
    this.select('datos');
    afterNextRender(
      () => {
        const panel = this.host.nativeElement.querySelector<HTMLElement>('#huella-panel-datos');
        panel?.focus({ preventScroll: true });
        panel?.scrollIntoView({ block: 'nearest' });
      },
      { injector: this.injector },
    );
  }

  /**
   * "Ver puntaje y buenas prácticas": en el popup cambia a la pestaña Prácticas (si el popup
   * escucha openTab); si no, navega a su ruta. con Ctrl, Cmd, Shift o el botón del medio el
   * navegador abre el enlace como siempre
   */
  protected openPractices(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    if (this.tabRequests.observed) {
      this.tabRequests.next('practices');
    } else {
      void this.router.navigateByUrl(this.practicesHref());
    }
  }
}
