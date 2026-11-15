import {
  Component,
  DOCUMENT,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { Api } from '../../../core/api';
import { EventLog, EventLogItem, EventType, LotDetail, Sensor } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { EventTimelineChart, TimelineEvent } from '../../../shared/charts';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoginInvite } from '../../../shared/ui/login-invite/login-invite';
import { LotTabs } from '../../../shared/ui/lot-tabs/lot-tabs';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { EventLogItemCard } from '../event-log-item/event-log-item';
import { EVENT_TYPES, EVENT_TYPE_LABELS, SENSORS, SENSOR_LABELS } from '../labels';
import { LotHero } from '../lot-hero/lot-hero';
import { LotNasa } from '../lot-nasa/lot-nasa';
import { LotPractices } from '../lot-practices/lot-practices';
import { RadarOpticalCompare } from '../radar-optical-compare/radar-optical-compare';

/** los filtros de la bitácora se ofrecen recién con una lista larga */
const FILTERS_FROM = 7;

/**
 * Ficha del lote (CLAUDE.md, sección 11, pantallas 2 y 3): arriba solo el nombre, la superficie
 * y el lugar; debajo lo que ve el satélite, las buenas prácticas, la bitácora con la
 * comparación radar contra óptico, las campañas y, si el lote es propio, el pasaporte. un lote
 * de ejemplo es de solo lectura: sin confirmar, corregir ni generar pasaporte. un lote que no
 * existe o es de otra cuenta (404) muestra la invitación a ingresar
 */
@Component({
  imports: [
    OriginBadge,
    EventLogItemCard,
    RadarOpticalCompare,
    LotHero,
    LotTabs,
    LotNasa,
    LotPractices,
    EventTimelineChart,
    SectionCard,
    Disclosure,
    Icon,
    LoginInvite,
  ],
  selector: 'app-lot-page',
  styleUrl: './lot-page.css',
  templateUrl: './lot-page.html',
})
export class LotPage {
  private readonly api = inject(Api);

  protected readonly lotId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => Number(params.get('id')))),
    { initialValue: NaN },
  );

  protected readonly lot = signal<LotDetail | null>(null);
  /** 'not-found': no existe, es de otra cuenta o falta ingresar (el backend no distingue) */
  protected readonly lotError = signal<'not-found' | 'failed' | null>(null);
  private readonly attempt = signal(0);
  protected readonly log = signal<EventLog | null>(null);
  /** bitácora completa, sin filtros: la usan el encabezado y las gráficas */
  protected readonly allEvents = signal<EventLogItem[]>([]);
  /** el backend dice si el lote es del usuario que ingresó (los de ejemplo no son de nadie) */
  protected readonly owned = computed(() => this.lot()?.owned === true);
  /** solo en un lote propio se ofrecen las acciones que escriben */
  protected readonly editable = computed(
    () => this.lot()?.owned === true && this.lot()?.is_example !== true,
  );
  /** sube con cada evento confirmado o corregido: las buenas prácticas se vuelven a pedir */
  protected readonly reviews = signal(0);
  protected readonly timelineEvents = computed<TimelineEvent[]>(() =>
    this.allEvents().map((event) => ({
      id: event.id,
      type: event.type,
      typeLabel: event.type_label,
      date: event.date,
      uncertaintyDays: event.date_uncertainty_days,
      origin: event.origin,
      sensorLabel: event.sensor_label,
      simulated: event.is_simulated,
      campaignLabel: event.campaign_label,
    })),
  );
  protected readonly logError = signal<string | null>(null);

  protected readonly typeFilter = signal<EventType | ''>('');
  protected readonly sensorFilter = signal<Sensor | ''>('');
  protected readonly campaignFilter = signal<number | ''>('');
  protected readonly filtersActive = computed(
    () => !!this.typeFilter() || !!this.sensorFilter() || this.campaignFilter() !== '',
  );
  protected readonly showFilters = computed(
    () => this.allEvents().length >= FILTERS_FROM || this.filtersActive(),
  );

  protected readonly selectedEventId = signal<number | null>(null);
  // se busca en la bitácora completa: con filtros activos el evento puede no estar en `log`
  protected readonly selectedEvent = computed(
    () => this.allEvents().find((event) => event.id === this.selectedEventId()) ?? null,
  );

  protected readonly eventTypes = EVENT_TYPES;
  protected readonly eventTypeLabels = EVENT_TYPE_LABELS;
  protected readonly sensors = SENSORS;
  protected readonly sensorLabels = SENSOR_LABELS;

  /** una línea que dice qué es la bitácora y qué se puede hacer con ella */
  protected readonly logSubtitle = computed(() => {
    const count = this.allEvents().length;
    if (count === 0)
      return 'Lo que detecten los satélites en el lote, con su fecha y su evidencia.';
    if (count === 1) {
      return this.editable()
        ? '1 evento detectado por satélite o declarado. Confirmalo o corregilo.'
        : '1 evento detectado por satélite o declarado, con su evidencia.';
    }
    return this.editable()
      ? `${count} eventos detectados por satélite o declarados. Confirmá o corregí cada uno.`
      : `${count} eventos detectados por satélite o declarados, con su evidencia.`;
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.lotId();
      this.attempt();
      this.lot.set(null);
      this.lotError.set(null);
      this.selectedEventId.set(null);
      if (!Number.isInteger(id)) {
        this.lotError.set('not-found');
        return;
      }
      const subscription = this.api.lot(id).subscribe({
        next: (lot) => this.lot.set(lot),
        error: (error: { status?: number }) =>
          this.lotError.set(error.status === 404 ? 'not-found' : 'failed'),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    effect((onCleanup) => {
      const id = this.lotId();
      this.attempt();
      if (!Number.isInteger(id)) {
        return;
      }
      const filters = {
        type: this.typeFilter(),
        sensor: this.sensorFilter(),
        campaign: this.campaignFilter(),
      };
      this.logError.set(null);
      // sin filtros la bitácora es la completa: la usan también el encabezado y las gráficas
      const unfiltered = !filters.type && !filters.sensor && filters.campaign === '';
      const subscription = this.api.lotEvents(id, filters).subscribe({
        next: (log) => {
          this.log.set(log);
          if (unfiltered) this.allEvents.set(log.events);
        },
        error: () =>
          this.logError.set('No se pudo cargar la bitácora. Revisá la conexión y probá de nuevo.'),
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected reload(): void {
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

  /** clic en la línea de tiempo: abre la comparación si hay evidencia, o lleva a la tarjeta */
  protected onTimelineSelect(id: number | string): void {
    const event = this.allEvents().find((item) => item.id === id);
    if (!event) return;
    if (event.evidence_image_url || event.evidence_optical_image_url) {
      this.clearFilters();
      this.openCompare(event);
      return;
    }
    this.selectedEventId.set(event.id);
    this.scrollWhenRendered(`evento-${event.id}`, 'center');
  }

  protected openCompare(event: EventLogItem): void {
    this.selectedEventId.set(event.id);
    // Lleva la vista a la comparación, que se dibuja arriba de la bitácora.
    this.scrollWhenRendered('compare', 'start');
  }

  protected yieldLabel(value: number): string {
    return `${value.toLocaleString('es-AR', { maximumFractionDigits: 2 })} t/ha`;
  }

  private readonly injector = inject(Injector);
  private readonly view = inject(DOCUMENT).defaultView;

  // sin zone.js el cambio se dibuja después de las microtareas: hay que esperar al render
  private scrollWhenRendered(id: string, block: ScrollLogicalPosition): void {
    afterNextRender(
      () => {
        const reduce = this.view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        this.view?.document
          .getElementById(id)
          ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block });
      },
      { injector: this.injector },
    );
  }

  // Pasaporte público (Dev C): lo genera y navega a su vista. Solo en un lote propio.
  private readonly router = inject(Router);
  protected readonly creatingPassport = signal(false);
  protected readonly passportError = signal<string | null>(null);

  protected generatePassport(lotId: number): void {
    if (!this.editable()) return;
    this.creatingPassport.set(true);
    this.passportError.set(null);
    this.api.createPassport(lotId).subscribe({
      next: (link) => void this.router.navigateByUrl(link.url),
      error: () => {
        this.creatingPassport.set(false);
        this.passportError.set('No se pudo generar el pasaporte. Probá de nuevo en un rato.');
      },
    });
  }

  protected onReviewed(updated: EventLogItem): void {
    this.allEvents.update((events) =>
      events.map((event) => (event.id === updated.id ? updated : event)),
    );
    this.log.update((log) =>
      log
        ? {
            ...log,
            events: log.events.map((event) => (event.id === updated.id ? updated : event)),
          }
        : log,
    );
    this.reviews.update((value) => value + 1);
  }
}
