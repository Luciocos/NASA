import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';

import { Api } from '../../../core/api';
import { EventLogItem, EventReview, EventType } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  EVENT_ORIGIN_MEANING,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  SENSOR_LABELS,
  formatConfidence,
  formatEventDay,
} from '../labels';
import { RadarOpticalCompare } from '../radar-optical-compare/radar-optical-compare';

let nextId = 0;

/**
 * Detalle de un evento de la bitácora, el que se abre al elegirlo en la lista. A la vista, el
 * origen en una etiqueta (y "Prueba de concepto" si lo detectó un satélite), la evidencia de
 * radar contra óptico y cuatro datos: fecha, sensor, confianza y campaña. Lo que explica cada
 * cosa y las métricas del procesamiento quedan plegados en "Cómo leer este evento".
 *
 * En un lote propio (editable) suma Corregir y, si el dato es estimado, Confirmar (PATCH
 * /api/events/{id}/), en una barra que queda a mano al pie. Confirmar solo cambia algo en un dato
 * estimado: pasa a declarado (events/views.py), así que en uno verificado o declarado no se
 * ofrece. En un lote de solo lectura, como un ejemplo, solo se mira.
 */
@Component({
  selector: 'app-event-log-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OriginBadge, SimulatedNotice, Disclosure, Icon, RadarOpticalCompare],
  styleUrl: './event-log-item.css',
  templateUrl: './event-log-item.html',
})
export class EventLogItemCard {
  private readonly api = inject(Api);
  private readonly injector = inject(Injector);

  readonly event = input.required<EventLogItem>();
  /** true solo en un lote propio: sin eso no se ofrece nada que escriba */
  readonly editable = input(false, { transform: booleanAttribute });
  readonly reviewed = output<EventLogItem>();

  private readonly toggle = viewChild<ElementRef<HTMLButtonElement>>('toggle');
  private readonly typeSelect = viewChild<ElementRef<HTMLSelectElement>>('typeInput');

  protected readonly ids = {
    form: `event-review-${++nextId}`,
    evidence: `event-evidence-${nextId}`,
  };
  protected readonly eventTypes = EVENT_TYPES;
  protected readonly eventTypeLabels = EVENT_TYPE_LABELS;

  /** otro evento en el mismo panel empieza de cero: sin formulario abierto ni aviso viejo */
  private readonly eventId = computed(() => this.event().id);
  protected readonly editing = linkedSignal({ source: this.eventId, computation: () => false });
  protected readonly saving = linkedSignal({ source: this.eventId, computation: () => false });
  protected readonly message = linkedSignal<number, string | null>({
    source: this.eventId,
    computation: () => null,
  });

  protected readonly originMeaning = computed(() => EVENT_ORIGIN_MEANING[this.event().origin]);
  protected readonly sensorLabel = computed(() => SENSOR_LABELS[this.event().sensor]);
  protected readonly dateLabel = computed(() => formatEventDay(this.event()));
  protected readonly confidence = computed(() => formatConfidence(this.event().confidence));
  /** un evento manual lo informó una persona: no es una detección satelital para validar */
  protected readonly detected = computed(() => this.event().sensor !== 'MANUAL');
  protected readonly bothImages = computed(
    () => !!this.event().evidence_image_url && !!this.event().evidence_optical_image_url,
  );
  protected readonly canConfirm = computed(() => this.event().origin === 'ESTIMATED');
  protected readonly metrics = computed(() =>
    Object.entries(this.event().metrics).map(([key, value]) => ({
      key,
      value: formatMetric(value),
    })),
  );

  protected toggleCorrection(): void {
    this.message.set(null);
    this.editing.update((editing) => !editing);
    if (this.editing()) {
      // el formulario aparece al final del detalle: el foco va a su primer campo
      afterNextRender(() => this.typeSelect()?.nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }

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
    const id = this.event().id;
    this.saving.set(true);
    this.message.set(null);
    this.api.reviewEvent(id, body).subscribe({
      next: (updated) => {
        this.reviewed.emit(updated);
        // mientras guardaba se eligió otro evento: el aviso no es de ese
        if (this.event().id !== id) return;
        this.saving.set(false);
        this.editing.set(false);
        this.message.set(describe(updated));
        // se va el formulario o Confirmar (un dato confirmado ya no es estimado), que tenían el
        // foco: vuelve a Corregir, que sigue en la barra
        afterNextRender(() => this.toggle()?.nativeElement.focus(), { injector: this.injector });
      },
      error: () => {
        if (this.event().id !== id) return;
        this.saving.set(false);
        this.message.set('No se pudo guardar. Revisá los datos e intentá de nuevo.');
      },
    });
  }
}

/** Valor de una métrica del pipeline, legible: listas separadas, números con coma, sí o no. */
function formatMetric(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatMetric).join(' · ');
  if (typeof value === 'number') return value.toLocaleString('es-AR', { maximumFractionDigits: 4 });
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (value === null || value === undefined || value === '') return 'Sin dato';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
