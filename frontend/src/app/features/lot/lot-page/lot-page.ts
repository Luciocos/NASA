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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { Api } from '../../../core/api';
import { EventLog, EventLogItem, EventType, LotDetail, Sensor } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { EventLogItemCard } from '../event-log-item/event-log-item';
import { EVENT_TYPES, EVENT_TYPE_LABELS, SENSORS, SENSOR_LABELS } from '../labels';
import { RadarOpticalCompare } from '../radar-optical-compare/radar-optical-compare';
import { LotHero } from '../lot-hero/lot-hero';
import { LotNasa } from '../lot-nasa/lot-nasa';
import { EventTimelineChart, TimelineEvent } from '../../../shared/charts';
import { LotTabs } from '../../../shared/ui/lot-tabs/lot-tabs';
import { DemoAccount } from '../../../core/account/demo-account';

/** Ficha del lote con su bitácora (CLAUDE.md, sección 11, pantallas 2 y 3). */
@Component({
  imports: [
    RouterLink,
    OriginBadge,
    EventLogItemCard,
    RadarOpticalCompare,
    LotHero,
    LotTabs,
    LotNasa,
    EventTimelineChart,
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
  protected readonly lotError = signal<string | null>(null);
  protected readonly log = signal<EventLog | null>(null);
  /** bitácora completa, sin filtros: la usan el encabezado y las gráficas */
  protected readonly allEvents = signal<EventLogItem[]>([]);
  private readonly account = inject(DemoAccount);
  protected readonly owned = computed(() => this.account.owns(this.lotId()));
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

  protected readonly selectedEventId = signal<number | null>(null);
  // se busca en la bitácora completa: con filtros activos el evento puede no estar en `log`
  protected readonly selectedEvent = computed(
    () => this.allEvents().find((event) => event.id === this.selectedEventId()) ?? null,
  );

  protected readonly eventTypes = EVENT_TYPES;
  protected readonly eventTypeLabels = EVENT_TYPE_LABELS;
  protected readonly sensors = SENSORS;
  protected readonly sensorLabels = SENSOR_LABELS;

  protected readonly areaLabel = computed(() => {
    const area = this.lot()?.area_ha;
    return area === undefined
      ? ''
      : `${area.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ha`;
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.lotId();
      if (!Number.isInteger(id)) {
        this.lotError.set('El identificador del lote no es válido.');
        return;
      }
      this.lot.set(null);
      this.lotError.set(null);
      this.selectedEventId.set(null);
      const subscription = this.api.lot(id).subscribe({
        next: (lot) => this.lot.set(lot),
        error: (error: { status?: number }) =>
          this.lotError.set(
            error.status === 404
              ? 'No existe un lote con ese identificador.'
              : 'No se pudo cargar el lote. Revisá la conexión y probá de nuevo.',
          ),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    effect((onCleanup) => {
      const id = this.lotId();
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

  // Pasaporte público (Dev C): lo genera y navega a su vista.
  private readonly router = inject(Router);
  protected readonly creatingPassport = signal(false);
  protected readonly passportError = signal<string | null>(null);

  protected generatePassport(lotId: number): void {
    this.creatingPassport.set(true);
    this.passportError.set(null);
    this.api.createPassport(lotId).subscribe({
      next: (link) => void this.router.navigateByUrl(link.url),
      error: () => {
        this.creatingPassport.set(false);
        this.passportError.set('No se pudo generar el pasaporte.');
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
  }
}
