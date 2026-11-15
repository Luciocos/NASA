import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  signal,
} from '@angular/core';

import { EventLogItem } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { RADAR_SENSORS, SENSOR_LABELS, SENSOR_SHORT_LABELS } from '../labels';

/** Sensor de la imagen óptica si el evento no indica otro. */
const DEFAULT_OPTICAL_SENSOR = 'HLS';

type ImageKey = 'radar' | 'optical';

/** Superpuestas con un deslizador, o lado a lado. */
type CompareMode = 'overlay' | 'side';

/**
 * Comparación radar contra óptico de un evento (CLAUDE.md, sección 11, pantalla 3). Vive dentro
 * del detalle del evento, que ya muestra el tipo, la fecha, el origen y la confianza.
 *
 * Con las dos imágenes, las superpone con un deslizador (lo primero que se ve) o las pone lado a
 * lado. Cada imagen se rotula con su sensor real: la de evidencia con el sensor del evento; la
 * óptica con metrics.optical_sensor si el pipeline lo informa, o HLS si no. Sobre la imagen va el
 * rótulo corto; al pie de cada una y en el nombre accesible, el completo. Si falta una imagen o
 * no carga, lo dice en una línea.
 */
@Component({
  selector: 'app-radar-optical-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  styleUrl: './radar-optical-compare.css',
  templateUrl: './radar-optical-compare.html',
})
export class RadarOpticalCompare {
  readonly event = input.required<EventLogItem>();

  protected readonly mode = signal<CompareMode>('overlay');
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

  private readonly isRadar = computed(() => RADAR_SENSORS.includes(this.event().sensor));

  /** "NISAR (radar, banda L)": al pie de la imagen y en su nombre accesible. */
  protected readonly radarLabel = computed(() => {
    const name = SENSOR_LABELS[this.event().sensor];
    return this.isRadar() ? name : `Evidencia: ${name}`;
  });
  /** "Radar NISAR": sobre la imagen superpuesta, donde el espacio es poco. */
  protected readonly radarTag = computed(() => {
    const name = SENSOR_SHORT_LABELS[this.event().sensor];
    return this.isRadar() ? name : `Evidencia: ${name}`;
  });

  private readonly opticalSensor = computed(() => {
    const sensor = this.event().metrics['optical_sensor'];
    return typeof sensor === 'string' && sensor ? sensor : DEFAULT_OPTICAL_SENSOR;
  });
  protected readonly opticalLabel = computed(() => `Óptico (${this.opticalSensor()})`);
  protected readonly opticalTag = computed(() => `Óptico ${this.opticalSensor()}`);

  /** Qué falta para comparar, en una línea; null si están las dos imágenes. */
  protected readonly missing = computed(() => {
    const event = this.event();
    const failed = this.failed();
    const radar = this.radarUrl();
    const optical = this.opticalUrl();
    if (radar && optical) return null;
    if (radar) {
      return failed.has('optical')
        ? 'No cargó la imagen óptica'
        : 'Sin imagen óptica para comparar';
    }
    if (optical) {
      return failed.has('radar')
        ? 'No cargó la imagen de radar'
        : 'Sin imagen de radar para comparar';
    }
    if (failed.size > 0) return 'No cargaron las imágenes de evidencia';
    return event.sensor === 'MANUAL'
      ? 'Sin imágenes: lo informó una persona'
      : 'Sin imágenes de evidencia: el procesamiento todavía no las entregó';
  });

  protected onSplitInput(value: string): void {
    this.split.set(Number(value));
  }

  protected onImageError(key: ImageKey): void {
    this.failed.update((failed) => new Set(failed).add(key));
  }
}
