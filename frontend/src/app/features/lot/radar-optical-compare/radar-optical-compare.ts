import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';

import { EventLogItem } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { Icon } from '../../../shared/ui/icon/icon';
import { RADAR_SENSORS, SENSOR_LABELS, formatConfidence, formatEventDate } from '../labels';

/** Rótulo de la imagen óptica si el evento no indica otro sensor. */
const DEFAULT_OPTICAL_LABEL = 'Óptico (HLS)';

type ImageKey = 'radar' | 'optical';

/**
 * Comparación radar contra óptico de un evento (CLAUDE.md, sección 11, pantalla 3).
 *
 * Muestra las dos imágenes lado a lado y superpuestas con un deslizador. Cada imagen se
 * rotula con su sensor real: la de evidencia con el sensor del evento; la óptica con
 * metrics.optical_sensor si el pipeline lo informa, o "Óptico (HLS)" si no.
 */
@Component({
  imports: [OriginBadge, SimulatedNotice, Disclosure, Icon],
  selector: 'app-radar-optical-compare',
  styleUrl: './radar-optical-compare.css',
  templateUrl: './radar-optical-compare.html',
})
export class RadarOpticalCompare {
  readonly event = input.required<EventLogItem>();
  readonly closed = output();

  /** Porcentaje del ancho que muestra la imagen de radar en la vista superpuesta. */
  protected readonly split = signal(50);
  /** Imágenes que fallaron al cargar; se reinicia al cambiar de evento. */
  protected readonly failed = linkedSignal<EventLogItem, Set<ImageKey>>({
    source: this.event,
    computation: () => new Set(),
  });

  protected readonly radarUrl = computed(() =>
    this.failed().has('radar') ? null : this.event().evidence_image_url,
  );
  protected readonly opticalUrl = computed(() =>
    this.failed().has('optical') ? null : this.event().evidence_optical_image_url,
  );

  protected readonly radarLabel = computed(() => {
    const sensor = this.event().sensor;
    const name = SENSOR_LABELS[sensor];
    return RADAR_SENSORS.includes(sensor) ? name : `Evidencia: ${name}`;
  });

  protected readonly opticalLabel = computed(() => {
    const sensor = this.event().metrics['optical_sensor'];
    return typeof sensor === 'string' && sensor ? `Óptico (${sensor})` : DEFAULT_OPTICAL_LABEL;
  });

  protected readonly dateLabel = computed(() => formatEventDate(this.event()));
  protected readonly confidence = computed(() => formatConfidence(this.event().confidence));
  protected readonly metrics = computed(() =>
    Object.entries(this.event().metrics).map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    })),
  );

  protected onSplitInput(value: string): void {
    this.split.set(Number(value));
  }

  protected onImageError(key: ImageKey): void {
    this.failed.update((failed) => new Set(failed).add(key));
  }
}
