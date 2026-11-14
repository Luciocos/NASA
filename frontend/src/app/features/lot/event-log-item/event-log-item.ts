import { Component, computed, inject, input, output, signal } from '@angular/core';

import { Api } from '../../../core/api';
import { EventLogItem, EventReview, EventType } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  SENSOR_LABELS,
  formatConfidence,
  formatEventDate,
} from '../labels';

/**
 * Un evento de la bitácora: tipo, fecha, sensor, origen, confianza, evidencia y la opción
 * de confirmarlo o corregirlo (PATCH /api/events/{id}/).
 */
@Component({
  imports: [OriginBadge, SimulatedNotice],
  selector: 'app-event-log-item',
  styleUrl: './event-log-item.css',
  templateUrl: './event-log-item.html',
})
export class EventLogItemCard {
  private readonly api = inject(Api);

  readonly event = input.required<EventLogItem>();
  readonly selected = input(false);
  readonly compare = output<EventLogItem>();
  readonly reviewed = output<EventLogItem>();

  protected readonly eventTypes = EVENT_TYPES;
  protected readonly eventTypeLabels = EVENT_TYPE_LABELS;

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);

  protected readonly sensorLabel = computed(() => SENSOR_LABELS[this.event().sensor]);
  protected readonly dateLabel = computed(() => formatEventDate(this.event()));
  protected readonly confidence = computed(() => formatConfidence(this.event().confidence));
  protected readonly hasEvidence = computed(
    () => !!this.event().evidence_image_url || !!this.event().evidence_optical_image_url,
  );
  protected readonly thumbnailFailed = signal(false);

  protected confirm(): void {
    const before = this.event().origin;
    this.send({ confirm: true }, (updated) =>
      updated.origin !== before
        ? 'Confirmado: ahora figura como dato declarado.'
        : 'Confirmado. El dato ya tenía respaldo, no cambia su origen.',
    );
  }

  protected submitCorrection(type: string, date: string, uncertainty: string, notes: string): void {
    if (!date) {
      this.message.set('Indicá una fecha.');
      return;
    }
    const body: EventReview = {
      type: type as EventType,
      date,
      date_uncertainty_days: uncertainty === '' ? null : Number(uncertainty),
      notes,
    };
    const before = this.event().origin;
    this.send(body, (updated) =>
      updated.origin !== before
        ? 'Corrección guardada: el dato pasa a figurar como declarado.'
        : 'Cambios guardados.',
    );
  }

  private send(body: EventReview, describe: (updated: EventLogItem) => string): void {
    this.saving.set(true);
    this.message.set(null);
    this.api.reviewEvent(this.event().id, body).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.editing.set(false);
        this.message.set(describe(updated));
        this.reviewed.emit(updated);
      },
      error: () => {
        this.saving.set(false);
        this.message.set('No se pudo guardar. Revisá los datos e intentá de nuevo.');
      },
    });
  }
}
