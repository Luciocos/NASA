import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { EventLogItem, LotDetail } from '../../../core/models';
import {
  DATA_SOURCES,
  LoadState,
  LotSatellite,
  NasaSourceId,
  lastDaysRain,
  latestSoilWetness,
  monthlyRain,
  ndviSummary,
} from '../../../core/nasa';
import { Connectivity } from '../../../core/offline';
import {
  ChartSeries,
  ColumnChart,
  ColumnItem,
  SeriesChart,
  SeriesMarker,
} from '../../../shared/charts';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { KpiCard, KpiTrend } from '../../../shared/ui/kpi-card/kpi-card';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { formatDate } from '../labels';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SOURCE_IDS: NasaSourceId[] = ['modisNdvi', 'power', 'nisar', 'hls', 'modisLandCover'];

interface KpiView {
  value: string | number;
  caption: string;
  trend?: KpiTrend | null;
  trendText?: string | null;
}

/**
 * lo que ve la NASA de un lote, consultado en vivo para su polígono. a la vista, tres
 * indicadores en lenguaje llano (verdor NDVI de MODIS con su tendencia, lluvia y humedad del
 * suelo de NASA POWER) y el verdor en el tiempo como protagonista. lo demás (lluvia por mes,
 * pasadas de NISAR y HLS, cobertura del suelo por año, fuentes y opciones) queda plegado en
 * "Ver detalle técnico". cada dato con su fuente real; lo que no llega queda como "Sin dato"
 * con el motivo
 */
@Component({
  selector: 'app-lot-nasa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SeriesChart, ColumnChart, OriginBadge, SectionCard, KpiCard, Disclosure],
  templateUrl: './lot-nasa.html',
  styleUrl: './lot-nasa.css',
})
export class LotNasa {
  private readonly satellite = inject(LotSatellite);
  private readonly connectivity = inject(Connectivity);

  readonly lot = input.required<LotDetail>();
  readonly events = input<readonly EventLogItem[]>([]);

  private readonly ref = computed(() => ({ id: this.lot().id, geometry: this.lot().geometry }));
  private readonly climateSince = monthStartMonthsAgo(12);

  /** sin red, lo que todavía no llegó (y no tiene copia guardada) espera a que vuelva */
  protected readonly offline = computed(() => !this.connectivity.online());
  protected readonly offlineText = 'Sin conexión: se consulta cuando vuelva la red';
  protected readonly dataSources = DATA_SOURCES;

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
  // solo los eventos del período pedido: la gráfica estira su eje para incluir cada marca
  protected readonly markers = computed<SeriesMarker[]>(() =>
    this.events()
      .filter((event) => event.date >= this.ndviSince())
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

  /** verdor actual: la tendencia compara con hace un año (misma época) o con la imagen anterior */
  protected readonly ndviKpi = computed<KpiView | null>(() => {
    const { latest, changeVsLastYear, changeVsPrevious } = this.summary();
    if (!latest || latest.mean === null) return null;
    const change = changeVsLastYear ?? changeVsPrevious;
    const versus = changeVsLastYear !== null ? 'hace un año' : 'la imagen anterior';
    return {
      value: decimal(latest.mean),
      caption: `Imagen de 16 días desde el ${formatDate(latest.date)}. Cuanto más cerca de 1, más verde.`,
      trend: change === null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      trendText:
        change === null
          ? null
          : change === 0
            ? `Igual que ${versus}`
            : `${signedDecimal(change)} frente a ${versus}`,
    };
  });
  protected readonly rainKpi = computed<KpiView | null>(() => {
    const rain = this.rainLast30();
    if (!rain || rain.rainMm === null) return null;
    const missing = rain.missingDays > 0 ? ` ${capitalize(missingText(rain.missingDays))}.` : '';
    return {
      value: Math.round(rain.rainMm),
      caption: `En la zona del lote, hasta el ${formatDate(rain.to)}.${missing}`,
    };
  });
  protected readonly soilKpi = computed<KpiView | null>(() => {
    const soil = this.soil();
    if (!soil) return null;
    const root = soil.soilRoot !== null;
    const value = root ? soil.soilRoot : soil.soilTop;
    if (value === null) return null;
    return {
      value: Math.round(value * 100),
      caption: `${root ? 'Zona de raíces' : 'Superficie'} al ${formatDate(soil.date)} (100 es saturado).`,
    };
  });

  /**
   * el último mes de lluvia si los días no llegan a su fin: es el mes en curso y su suma todavía
   * no es la del mes completo
   */
  protected readonly rainOpenMonth = computed(() => {
    const days = this.climate().data;
    const last = days?.at(-1);
    if (!days || !last) return null;
    const month = last.date.slice(0, 7);
    if (last.date === monthEnd(month)) return null;
    const inMonth = days.filter((day) => day.date.startsWith(month));
    const lastRain = inMonth.filter((day) => day.rainMm !== null).at(-1)?.date;
    const label = monthLabel(month);
    if (!lastRain) {
      return {
        month,
        note: 'mes en curso: todavía sin dato',
        aside: `* ${label} es el mes en curso: todavía sin dato.`,
      };
    }
    const until = `${lastRain.slice(8, 10)}/${lastRain.slice(5, 7)}`;
    const gaps = inMonth.filter((day) => day.rainMm === null && day.date < lastRain).length;
    return {
      month,
      note: `mes en curso: hasta el ${until}${gaps ? `, ${missingText(gaps)}` : ''}`,
      aside: `* ${label} es el mes en curso: suma la lluvia hasta el ${until}, no la del mes completo.`,
    };
  });
  protected readonly rainColumns = computed<ColumnItem[]>(() => {
    const days = this.climate().data;
    if (!days) return [];
    const open = this.rainOpenMonth();
    return monthlyRain(days)
      .slice(-12)
      .map((month) => {
        const current = open?.month === month.month ? open : null;
        return {
          label: `${monthLabel(month.month)}${current ? '*' : ''}`,
          value: month.rainMm,
          tone: 'water' as const,
          note:
            current?.note ?? (month.missingDays > 0 ? missingText(month.missingDays) : undefined),
        };
      });
  });
  /**
   * el catálogo no respondió del todo: una lista vacía no quiere decir que no haya escenas, así
   * que se avisa la falla con su motivo
   */
  protected readonly scenesFailure = computed(() => {
    const { status, error } = this.scenes();
    if (status !== 'partial' && status !== 'error') return null;
    const failed =
      status === 'partial'
        ? 'La consulta al catálogo falló en parte.'
        : 'La consulta al catálogo falló.';
    return error ? `${failed} ${error}` : failed;
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
  /** algo terminó sin llegar (o llegó en parte): se ofrece volver a pedirlo, una sola vez */
  protected readonly anyFailed = computed(() =>
    [this.ndvi(), this.climate(), this.scenes(), this.landCover()].some(
      (state) => !this.pending(state) && (state.status === 'error' || state.status === 'partial'),
    ),
  );

  protected readonly formatDate = formatDate;

  constructor() {
    // al volver la red se pide de nuevo lo que quedó esperando o falló sin conexión
    let wasOnline = this.connectivity.online();
    effect(() => {
      const online = this.connectivity.online();
      if (online && !wasOnline) untracked(() => this.satellite.retry(this.ref()));
      wasOnline = online;
    });
  }

  protected retry(): void {
    this.satellite.retry(this.ref());
  }

  /** todavía esperando respuesta: un 'partial' con todo el progreso ya terminó, con faltantes */
  protected pending(state: LoadState<unknown>): boolean {
    return state.status === 'loading' || (state.status === 'partial' && state.progress < 1);
  }

  /** un indicador sin valor todavía: esqueleto mientras se consulta con red */
  protected waiting(state: LoadState<unknown>): boolean {
    return this.pending(state) && !this.offline();
  }

  /** por qué un indicador quedó sin dato */
  protected reason(state: LoadState<unknown>): string {
    if (this.pending(state)) return this.offlineText;
    return state.error ?? 'El servicio no devolvió datos para este lote.';
  }

  protected number(value: number | null | undefined, digits = 2): string {
    return value == null
      ? 'Sin dato'
      : value.toLocaleString('es-AR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  protected signed(value: number | null): string {
    return value === null ? 'Sin dato' : signedDecimal(value);
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

/** último día de un mes AAAA-MM, en AAAA-MM-DD */
function monthEnd(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}

/** '2026-11' -> 'nov 26' */
function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${year.slice(2)}`;
}

function missingText(days: number): string {
  return days === 1 ? '1 día sin dato' : `${days} días sin dato`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 0.6234 -> '0,62' */
function decimal(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 0.12 -> '+0,12'; -0.05 -> '−0,05' */
function signedDecimal(value: number): string {
  const text = Math.abs(value).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}`;
}
