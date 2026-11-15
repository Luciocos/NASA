import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { Api } from '../../../core/api';
import { CampaignDetail, EventLogItem, EventType, LotDetail, Sensor } from '../../../core/models';
import { EventGlyph } from '../../../shared/iso';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { EventLogItemCard } from '../event-log-item/event-log-item';
import {
  EVENT_ORIGIN_MEANING,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  ORIGINS,
  SENSORS,
  SENSOR_SHORT_LABELS,
  formatMonth,
  formatShortDate,
  formatUncertainty,
  formatYield,
} from '../labels';

/** los filtros se ofrecen recién con una lista larga: más de 6 eventos, como en Mi campo */
export const FILTERS_FROM = 7;

/**
 * filas a la vista antes de plegar el resto detrás de "Ver los N eventos": con sus encabezados de
 * campaña entran en lo que se ve del popup en una compu (1440x900) y en el celular
 */
export const EVENTS_SHOWN = 6;

/**
 * desde este ancho de ventana el detalle es un panel al costado de la lista; más angosto (el
 * celular), una hoja que sube desde abajo. es el mismo corte del popup del lote: la hoja aparece
 * solo cuando el popup ya ocupa la pantalla entera, así nunca se sale de él
 */
export const SIDE_PANEL_QUERY = '(min-width: 40.0625rem)';

/** lo que recorre Tab adentro de la hoja del celular */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let nextId = 0;

/** eventos de una campaña (o de un mes, si ninguno tiene campaña), del más viejo al más nuevo */
interface LogGroup {
  key: string;
  title: string;
  /** cultivo y rinde de la campaña del grupo: null en un grupo por mes o "Sin campaña" */
  campaign: CampaignDetail | null;
  /** ordena los grupos del más nuevo al más viejo */
  sortKey: string;
  events: EventLogItem[];
  /** eventos del grupo con la lista desplegada: el encabezado dice siempre el total */
  total: number;
}

/**
 * Bitácora del lote (CLAUDE.md, sección 11, pantallas 2 y 3), pensada para la pestaña Bitácora
 * del popup del lote y para su ruta /lotes/:id/bitacora.
 *
 * Los eventos son una línea de tiempo de filas de una línea (ícono, qué pasó, fecha, sensor y
 * origen) agrupadas por campaña, y el encabezado de cada campaña dice su cultivo y su rinde con
 * su origen. Sin campañas en los eventos, se agrupa por mes y las campañas van arriba en fichas.
 * Con muchos eventos se ven los primeros y el resto se pide; los filtros aparecen recién con
 * muchos eventos, detrás de "Filtrar". Lo que explica de dónde sale cada evento queda plegado al
 * pie, en "Cómo se arma la bitácora".
 *
 * Elegir un evento abre su detalle sin salir del lugar: en la compu, un panel al costado de la
 * lista que la acompaña mientras se desplaza; en el celular, una hoja desde abajo. No es otro
 * diálogo encima de todo: vive adentro del componente, así que adentro del popup se abre en el
 * popup. Escape y la X lo cierran (Escape no llega a cerrar el popup) y el foco vuelve al evento.
 * La hoja del celular retiene el foco y deja inerte la lista mientras está abierta.
 */
@Component({
  selector: 'app-lot-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    SectionCard,
    Disclosure,
    OriginBadge,
    SimulatedNotice,
    EventGlyph,
    Icon,
    EventLogItemCard,
  ],
  host: { '(keydown)': 'onKeydown($event)' },
  styleUrl: './lot-log.css',
  templateUrl: './lot-log.html',
})
export class LotLog {
  private readonly api = inject(Api);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly lot = input.required<LotDetail>();
  /** true solo en un lote propio: el detalle suma Confirmar y Corregir */
  readonly editable = input(false, { transform: booleanAttribute });

  protected readonly uid = `lot-log-${++nextId}`;
  /** un lote de ejemplo es de solo lectura aunque llegue editable por error */
  protected readonly canEdit = computed(() => this.editable() && this.lot().is_example !== true);

  private readonly lotId = computed(() => this.lot().id);
  private readonly attempt = signal(0);
  /** la bitácora completa; null mientras carga */
  protected readonly events = signal<EventLogItem[] | null>(null);
  protected readonly failed = signal(false);

  /** de la más nueva a la más vieja, como los grupos de la lista */
  protected readonly campaigns = computed(() =>
    [...this.lot().campaigns].sort((a, b) => compareLabels(b.label, a.label)),
  );
  /** los eventos traen campaña: la lista se agrupa por campaña y cada encabezado la describe */
  protected readonly byCampaign = computed(
    () => this.events()?.some((event) => event.campaign !== null) ?? false,
  );
  /** si la lista no se agrupa por campaña, las campañas van arriba en fichas de una línea */
  protected readonly campaignChips = computed(() => (this.byCampaign() ? [] : this.campaigns()));
  /** la ayuda aclara que Sentinel-1 no es dato NASA solo si aparece */
  protected readonly usesSentinel = computed(
    () => this.events()?.some((event) => event.sensor === 'SENTINEL1') ?? false,
  );
  /** todos simulados: un solo aviso arriba en vez de repetirlo en cada fila */
  protected readonly allSimulated = computed(() => {
    const events = this.events() ?? [];
    return events.length > 0 && events.every((event) => event.is_simulated);
  });

  protected readonly filtersOpen = signal(false);
  protected readonly typeFilter = signal<EventType | ''>('');
  protected readonly sensorFilter = signal<Sensor | ''>('');
  protected readonly campaignFilter = signal<number | ''>('');
  protected readonly activeFilters = computed(
    () =>
      Number(this.typeFilter() !== '') +
      Number(this.sensorFilter() !== '') +
      Number(this.campaignFilter() !== ''),
  );
  protected readonly canFilter = computed(
    () => (this.events()?.length ?? 0) >= FILTERS_FROM || this.activeFilters() > 0,
  );
  /** cada filtro ofrece solo lo que aparece en la bitácora */
  protected readonly typeOptions = computed(() =>
    EVENT_TYPES.filter((type) => this.events()?.some((event) => event.type === type)),
  );
  protected readonly sensorOptions = computed(() =>
    SENSORS.filter((sensor) => this.events()?.some((event) => event.sensor === sensor)),
  );
  protected readonly campaignOptions = computed(() =>
    this.campaigns().filter((campaign) =>
      this.events()?.some((event) => event.campaign === campaign.id),
    ),
  );

  protected readonly visible = computed(() => {
    const type = this.typeFilter();
    const sensor = this.sensorFilter();
    const campaign = this.campaignFilter();
    return (this.events() ?? []).filter(
      (event) =>
        (type === '' || event.type === type) &&
        (sensor === '' || event.sensor === sensor) &&
        (campaign === '' || event.campaign === campaign),
    );
  });
  /** sin filtros, una campaña sin eventos igual muestra su cultivo y su rinde */
  private readonly groups = computed(() =>
    groupEvents(this.visible(), this.campaigns(), this.byCampaign(), this.activeFilters() === 0),
  );

  protected readonly showAll = signal(false);
  protected readonly folds = computed(() => this.visible().length > EVENTS_SHOWN);
  /** con la lista plegada, solo las primeras EVENTS_SHOWN filas, en el orden de la lista */
  protected readonly shownGroups = computed(() => {
    const groups = this.groups();
    if (this.showAll() || !this.folds()) return groups;
    const shown: LogGroup[] = [];
    let left = EVENTS_SHOWN;
    for (const group of groups) {
      if (left <= 0) break;
      shown.push({ ...group, events: group.events.slice(0, left) });
      left -= group.events.length;
    }
    return shown;
  });

  /** ventana ancha: el detalle va al costado de la lista; si no, una hoja desde abajo */
  protected readonly wide = signal(false);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  protected readonly selectedId = signal<number | null>(null);
  protected readonly selected = computed(
    () => this.events()?.find((event) => event.id === this.selectedId()) ?? null,
  );
  protected readonly sideOpen = computed(() => this.selected() !== null && this.wide());
  protected readonly sheetOpen = computed(() => this.selected() !== null && !this.wide());

  /** una línea: cuántos eventos hay y qué se puede hacer con ellos */
  protected readonly subtitle = computed(() => {
    const count = this.events()?.length ?? 0;
    if (count === 0) return null;
    const what = this.canEdit() ? 'revisarlo' : 'ver su evidencia';
    return count === 1
      ? `1 evento · abrilo para ${what}`
      : `${count} eventos · abrí uno para ${what}`;
  });

  protected readonly origins = ORIGINS;
  protected readonly originMeaning = EVENT_ORIGIN_MEANING;
  protected readonly eventTypeLabels = EVENT_TYPE_LABELS;
  protected readonly sensorShort = SENSOR_SHORT_LABELS;
  protected readonly shortDate = formatShortDate;
  protected readonly uncertainty = formatUncertainty;
  protected readonly yieldLabel = formatYield;

  constructor() {
    effect((onCleanup) => {
      const id = this.lotId();
      this.attempt();
      this.events.set(null);
      this.failed.set(false);
      this.selectedId.set(null);
      this.showAll.set(false);
      const subscription = this.api.lotEvents(id).subscribe({
        next: (log) => this.events.set(log.events),
        error: () => this.failed.set(true),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    this.watchWidth();

    // el panel del costado mide lo que se ve de la zona que se desplaza (el popup o la página)
    effect((onCleanup) => {
      if (!this.sideOpen()) return;
      onCleanup(this.fitSidePanel());
    });
  }

  protected retry(): void {
    this.attempt.update((value) => value + 1);
  }

  protected onTypeFilter(value: string): void {
    this.typeFilter.set(value as EventType | '');
  }

  protected onSensorFilter(value: string): void {
    this.sensorFilter.set(value as Sensor | '');
  }

  protected onCampaignFilter(value: string): void {
    this.campaignFilter.set(value === '' ? '' : Number(value));
  }

  protected clearFilters(): void {
    this.typeFilter.set('');
    this.sensorFilter.set('');
    this.campaignFilter.set('');
  }

  protected countLabel(count: number): string {
    return count === 1 ? '1 evento' : `${count} eventos`;
  }

  protected open(event: EventLogItem): void {
    this.selectedId.set(event.id);
    // ya dibujado: el título nombra al panel cuando el foco entra
    afterNextRender(() => this.closeButton()?.nativeElement.focus(), { injector: this.injector });
  }

  protected close(): void {
    const id = this.selectedId();
    if (id === null) return;
    this.selectedId.set(null);
    // la lista deja de estar inerte recién al dibujarse: ahí el foco vuelve al evento
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[data-event-id="${id}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  protected onReviewed(updated: EventLogItem): void {
    this.events.update(
      (events) => events?.map((event) => (event.id === updated.id ? updated : event)) ?? events,
    );
  }

  /**
   * Escape cierra el detalle y no sigue: ni el popup del lote ni la página se cierran con él. En
   * la hoja del celular, Tab da la vuelta adentro de la hoja.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (this.selectedId() === null) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === 'Tab' && this.sheetOpen()) {
      this.keepFocusInSheet(event);
    }
  }

  private keepFocusInSheet(event: KeyboardEvent): void {
    const panel = this.panel()?.nativeElement;
    if (!panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => !isFolded(item),
    );
    const first = items.at(0);
    const last = items.at(-1);
    const active = document.activeElement;
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const outside = !panel.contains(active) || active === panel;
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  }

  private watchWidth(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(SIDE_PANEL_QUERY);
    this.wide.set(query.matches);
    const onChange = (change: MediaQueryListEvent) => this.wide.set(change.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }

  /**
   * El panel del costado se pega arriba de la zona que se desplaza y entra entero en lo que se ve
   * de ella. Adentro del popup esa zona es el contenido de la pestaña: el panel se pega en el
   * borde de su relleno, que el navegador ya respeta, y su alto es lo que se ve sin los rellenos.
   * En la página valen los valores por defecto del CSS (la ventana y la barra de arriba, también
   * pegada). Devuelve cómo dejar de seguir sus cambios de tamaño.
   */
  private fitSidePanel(): () => void {
    const host = this.host.nativeElement;
    const scroller = scrollParent(host);
    if (!scroller) {
      host.style.removeProperty('--log-visible-h');
      host.style.removeProperty('--log-sticky-top');
      return () => undefined;
    }
    const fit = () => {
      const style = getComputedStyle(scroller);
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      host.style.setProperty('--log-visible-h', `${scroller.clientHeight - padding}px`);
      host.style.setProperty('--log-sticky-top', '0px');
    };
    fit();
    if (typeof ResizeObserver !== 'function') return () => undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(scroller);
    return () => observer.disconnect();
  }
}

/** "2026/27" antes que "2025/26": las etiquetas de campaña se comparan con sus números */
function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true });
}

/**
 * Agrupa por campaña si algún evento la tiene, y si no por mes. Por campaña, con `withEmpty` una
 * campaña sin eventos igual tiene su grupo (muestra su cultivo y su rinde); los eventos sin
 * campaña van al final, en "Sin campaña". Los grupos van del más nuevo al más viejo; adentro, en
 * orden de fecha, para leer la campaña como pasó.
 */
function groupEvents(
  events: readonly EventLogItem[],
  campaigns: readonly CampaignDetail[],
  byCampaign: boolean,
  withEmpty: boolean,
): LogGroup[] {
  const groups = new Map<string, LogGroup>();
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  if (byCampaign && withEmpty) {
    for (const campaign of campaigns) {
      const key = `c${campaign.id}`;
      groups.set(key, campaignGroup(key, campaign, campaign.label));
    }
  }
  for (const event of sorted) {
    const key = byCampaign ? `c${event.campaign ?? 'none'}` : `m${event.date.slice(0, 7)}`;
    let group = groups.get(key);
    if (!group) {
      if (!byCampaign) {
        group = {
          key,
          title: formatMonth(event.date),
          campaign: null,
          sortKey: key,
          events: [],
          total: 0,
        };
      } else {
        const campaign = campaigns.find((item) => item.id === event.campaign) ?? null;
        group = campaignGroup(key, campaign, campaign?.label ?? event.campaign_label);
      }
      groups.set(key, group);
    }
    group.events.push(event);
    group.total += 1;
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === 'cnone') return 1;
    if (b.key === 'cnone') return -1;
    return compareLabels(b.sortKey, a.sortKey);
  });
}

function campaignGroup(
  key: string,
  campaign: CampaignDetail | null,
  label: string | null,
): LogGroup {
  const title = key === 'cnone' ? 'Sin campaña' : label ? `Campaña ${label}` : 'Campaña sin nombre';
  return { key, title, campaign, sortKey: label ?? '', events: [], total: 0 };
}

/** está en el cuerpo de un plegable cerrado: no se ve ni recibe el foco */
function isFolded(element: HTMLElement): boolean {
  const details = element.closest('details');
  return !!details && !details.open && !element.closest('summary');
}

/** el ancestro más cercano que se desplaza; null si es la página entera */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) return null;
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node;
  }
  return null;
}
