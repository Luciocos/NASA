import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { Api } from '../../../core/api';
import { EventLog, EventLogItem, EventType, LotDetail, Sensor } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { EventLogItemCard } from '../event-log-item/event-log-item';
import { EVENT_TYPES, EVENT_TYPE_LABELS, SENSORS, SENSOR_LABELS } from '../labels';
import { RadarOpticalCompare } from '../radar-optical-compare/radar-optical-compare';

/** Ficha del lote con su bitácora (CLAUDE.md, sección 11, pantallas 2 y 3). */
@Component({
  imports: [RouterLink, OriginBadge, EventLogItemCard, RadarOpticalCompare],
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
  protected readonly logError = signal<string | null>(null);

  protected readonly typeFilter = signal<EventType | ''>('');
  protected readonly sensorFilter = signal<Sensor | ''>('');
  protected readonly campaignFilter = signal<number | ''>('');

  protected readonly selectedEventId = signal<number | null>(null);
  protected readonly selectedEvent = computed(
    () => this.log()?.events.find((event) => event.id === this.selectedEventId()) ?? null,
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
              : 'No se pudo cargar el lote. ¿Está corriendo el backend?',
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
      const subscription = this.api.lotEvents(id, filters).subscribe({
        next: (log) => this.log.set(log),
        error: () => this.logError.set('No se pudo cargar la bitácora.'),
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

  protected openCompare(event: EventLogItem): void {
    this.selectedEventId.set(event.id);
    // Lleva la vista a la comparación, que se dibuja arriba de la bitácora.
    queueMicrotask(() =>
      document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  protected onReviewed(updated: EventLogItem): void {
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
