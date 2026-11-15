import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { EventLogItem, LotDetail } from '../../../core/models';
import {
  DATA_SOURCES,
  LotSatellite,
  NasaSourceId,
  lastDaysRain,
  latestSoilWetness,
  monthlyRain,
  ndviSummary,
} from '../../../core/nasa';
import {
  ChartSeries,
  ColumnChart,
  ColumnItem,
  SeriesChart,
  SeriesMarker,
} from '../../../shared/charts';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { formatDate } from '../labels';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SOURCE_IDS: NasaSourceId[] = ['modisNdvi', 'power', 'nisar', 'hls', 'modisLandCover'];

/**
 * lo que ve la NASA de un lote, consultado en vivo para su polígono: NDVI de MODIS desde 2020,
 * lluvia y humedad de NASA POWER, pasadas de NISAR y HLS, y cobertura del suelo por año. cada
 * dato con su fuente real; lo que no llega queda como "Sin dato" con el motivo
 */
@Component({
  selector: 'app-lot-nasa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeriesChart, ColumnChart, OriginBadge],
  templateUrl: './lot-nasa.html',
  styleUrl: './lot-nasa.css',
})
export class LotNasa {
  private readonly satellite = inject(LotSatellite);

  readonly lot = input.required<LotDetail>();
  readonly events = input<readonly EventLogItem[]>([]);

  private readonly ref = computed(() => ({ id: this.lot().id, geometry: this.lot().geometry }));
  private readonly climateSince = monthStartMonthsAgo(12);

  /**
   * desde cuándo se pide el NDVI: el servicio de MODIS tarda unos 30 a 60 s por pedido, así que
   * primero van los últimos 12 meses y el historial desde 2020 se pide a mano (queda guardado)
   */
  protected readonly ndviSince = signal(monthStartMonthsAgo(12));
  protected readonly fullHistory = computed(() => this.ndviSince() === '2020-01-01');
  protected readonly ndvi = computed(() =>
    this.satellite.ndviHistory(this.ref(), this.ndviSince())(),
  );
  protected readonly climate = computed(() =>
    this.satellite.climate(this.ref(), this.climateSince)(),
  );
  protected readonly scenes = computed(() => this.satellite.scenes(this.ref())());
  protected readonly landCover = computed(() => this.satellite.landCover(this.ref())());

  protected readonly sources = SOURCE_IDS.map((id) => DATA_SOURCES[id]);

  protected readonly summary = computed(() => ndviSummary(this.ndvi().data ?? []));
  protected readonly ndviSeries = computed<ChartSeries[]>(() => {
    const data = this.ndvi().data ?? [];
    if (data.length === 0) return [];
    return [
      {
        name: 'NDVI del lote (MODIS)',
        tone: 'positive',
        points: data.map((obs) => ({
          date: obs.date,
          value: obs.mean,
          label:
            obs.mean === null ? (obs.quality === 'cloudy' ? 'nublado' : 'sin dato') : undefined,
        })),
      },
    ];
  });
  protected readonly markers = computed<SeriesMarker[]>(() =>
    this.events()
      .filter((event) => event.date >= '2020-01-01')
      .map((event) => ({ date: event.date, label: event.type_label })),
  );
  protected readonly rainLast30 = computed(() => {
    const days = this.climate().data;
    return days ? lastDaysRain(days, 30) : null;
  });
  protected readonly soil = computed(() => {
    const days = this.climate().data;
    return days ? latestSoilWetness(days) : null;
  });
  protected readonly rainColumns = computed<ColumnItem[]>(() => {
    const days = this.climate().data;
    if (!days) return [];
    return monthlyRain(days)
      .slice(-12)
      .map((month) => {
        const [year, m] = month.month.split('-');
        return {
          label: `${MONTHS[Number(m) - 1]} ${year.slice(2)}`,
          value: month.rainMm,
          tone: 'water' as const,
          note: month.missingDays > 0 ? `${month.missingDays} días sin dato` : undefined,
        };
      });
  });
  protected readonly nisar = computed(() =>
    (this.scenes().data?.items ?? []).filter((scene) => scene.mission === 'NISAR'),
  );
  protected readonly hls = computed(() =>
    (this.scenes().data?.items ?? []).filter((scene) => scene.mission === 'HLS'),
  );
  protected readonly lastClearHls = computed(
    () => this.hls().find((scene) => scene.cloudCover !== null && scene.cloudCover <= 20) ?? null,
  );

  protected readonly formatDate = formatDate;

  protected retry(): void {
    this.satellite.retry(this.ref());
  }

  protected number(value: number | null | undefined, digits = 2): string {
    return value == null
      ? 'Sin dato'
      : value.toLocaleString('es-AR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  protected signed(value: number | null): string {
    if (value === null) return '';
    const text = Math.abs(value).toLocaleString('es-AR', { maximumFractionDigits: 2 });
    return `${value > 0 ? '▲ +' : value < 0 ? '▼ −' : '= '}${text}`;
  }

  protected day(iso: string): string {
    return formatDate(iso.slice(0, 10));
  }

  protected percent(value: number | null): string {
    return value === null ? 'Sin dato' : `${Math.round(value * 100)} %`;
  }
}

/** primer día del mes, n meses atrás, en AAAA-MM-DD */
function monthStartMonthsAgo(n: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  return date.toISOString().slice(0, 10);
}
