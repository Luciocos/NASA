import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { EventLogItem, LotDetail } from '../../../core/models';
import {
  DATA_SOURCES,
  LAND_USE_GROUP_LABELS,
  LandUseEvidence,
  LandUseYear,
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
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiCard, KpiTrend } from '../../../shared/ui/kpi-card/kpi-card';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { IconName } from '../../../shared/ui/icon/icons';
import { EVENT_TYPE_LABELS, formatDate } from '../labels';
import {
  firstSentence,
  forLot,
  modisStatus,
  partialChange,
} from '../lot-practices/land-use/land-use';
import { InfoTip } from '../../../shared/ui/info-tip/info-tip';
import { SlideTrack } from './slide-track';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** el celular: el mismo corte en el que el popup ocupa la pantalla entera */
const NARROW_QUERY = '(max-width: 40rem)';
/**
 * cada fuente en pocas palabras para la tarjeta, que entra en una línea con su origen; el nombre
 * completo, el producto y la resolución van en su ayuda (i)
 */
const SOURCE_ROWS: readonly { id: NasaSourceId; short: string }[] = [
  { id: 'modisNdvi', short: 'MODIS · greenness' },
  { id: 'power', short: 'NASA POWER · weather' },
  { id: 'nisar', short: 'NISAR · radar' },
  { id: 'hls', short: 'HLS · imagery' },
  { id: 'modisLandUse', short: 'MODIS · land use' },
];

/** las tarjetas deslizables del detalle, en orden: su título es también su nombre accesible */
export const SATELLITE_SLIDES = [
  'Monthly rainfall',
  'Land use since 2020',
  'NISAR passes',
  'HLS imagery',
  'Greenness and moisture',
  'Sources and options',
] as const;

interface LandUseChip {
  text: string;
  tone: string;
  icon: IconName;
}

/**
 * cómo quedó el uso del suelo según MODIS, en pocas palabras y con su tono: lo mismo que dice la
 * tarjeta de Prácticas. un empate en el año base no alcanza para afirmar un cambio, y un cambio
 * en parte del lote se dice así
 */
function landUseChip(evidence: LandUseEvidence, state: LoadState<LandUseEvidence>): LandUseChip {
  const status = modisStatus(state);
  if (status === 'unchanged') return { text: 'No major changes', tone: 'chip--ok', icon: 'check' };
  if (status === 'unclear') {
    return { text: `No dominant use in ${evidence.baselineYear}`, tone: '', icon: 'layers' };
  }
  if (status === 'possible_change') {
    return partialChange(evidence)
      ? { text: 'Possible change in part of the field', tone: 'chip--warn', icon: 'alert' }
      : { text: 'Possible change: worth checking', tone: 'chip--warn', icon: 'alert' };
  }
  return { text: 'No data to compare', tone: '', icon: 'minus' };
}

/**
 * el motivo del servicio sin la cuenta interna de pedidos ("Faltan 2 de 3 tandas."): esa parte
 * no le dice nada al productor
 */
export function serviceText(error: string | null | undefined): string {
  return (error ?? '')
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/\b(tandas?|batch(es)?)\b/i.test(sentence))
    .join(' ')
    .trim();
}

interface KpiView {
  value: string | number;
  caption: string;
  trend?: KpiTrend | null;
  trendText?: string | null;
}

/**
 * pestaña Satélite: lo que ve la NASA de un lote, consultado en vivo para su polígono. a la
 * vista, tres indicadores con un número cada uno (verdor NDVI de MODIS con su tendencia, lluvia
 * y humedad del suelo de NASA POWER) y el verdor en el tiempo como protagonista. el detalle
 * (lluvia por mes, uso del suelo desde 2020, pasadas de NISAR, imágenes HLS, el detalle del
 * verdor y la humedad, y las fuentes con sus opciones) va en tarjetas deslizables; las
 * explicaciones, detrás de un (i). cada dato con su fuente real y su origen; lo que no llega
 * queda como "Sin dato" con el motivo, y sin conexión sale de la copia guardada en el dispositivo
 *
 * en el celular esas tarjetas van plegadas en "Más datos": a la vista quedan los tres números y
 * el verdor en el tiempo, y la pestaña entra en una pantalla
 */
@Component({
  selector: 'app-lot-nasa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    SeriesChart,
    ColumnChart,
    OriginBadge,
    SectionCard,
    KpiCard,
    Disclosure,
    Icon,
    InfoTip,
    SlideTrack,
  ],
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
  protected readonly offlineText = 'Offline: it will be queried when the connection returns';
  /** lo medido: MODIS responde en 40 a 70 s y avisa la demora a los 150 s */
  protected readonly modisWait = 'it may take a couple of minutes';
  protected readonly dataSources = DATA_SOURCES;
  /** pantalla de celular: "Más datos" va plegado (y se abre con un toque) */
  protected readonly narrow = signal(false);
  protected readonly moreOpen = signal(false);

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
  /** uso del suelo de los píxeles del lote desde 2020 (MODIS): el mismo pedido que usa Prácticas */
  protected readonly landUse = computed(() => this.satellite.landUse(this.ref())());
  protected readonly landUseChip = computed(() => {
    const state = this.landUse();
    return state.data ? landUseChip(state.data, state) : null;
  });
  protected readonly slides = SATELLITE_SLIDES;

  protected readonly sources = SOURCE_ROWS.map((row) => ({
    ...DATA_SOURCES[row.id],
    short: row.short,
  }));
  /** un lote propio: las ayudas le hablan al dueño ("tu lote"); en un ejemplo, "este lote" */
  protected readonly mine = computed(
    () => this.lot().owned === true && this.lot().is_example !== true,
  );
  protected readonly forLot = forLot;
  protected readonly serviceText = serviceText;

  protected readonly summary = computed(() => ndviSummary(this.ndvi().data ?? []));
  protected readonly ndviSeries = computed<ChartSeries[]>(() => {
    const data = this.ndvi().data ?? [];
    if (data.length === 0) return [];
    return [
      {
        name: 'Field NDVI (MODIS)',
        tone: 'positive',
        points: data.map((obs) => ({
          date: obs.date,
          value: obs.mean,
          label: obs.mean === null ? (obs.quality === 'cloudy' ? 'cloudy' : 'no data') : undefined,
        })),
      },
    ];
  });
  // solo los eventos del período pedido: la gráfica estira su eje para incluir cada marca
  protected readonly markers = computed<SeriesMarker[]>(() =>
    this.events()
      .filter((event) => event.date >= this.ndviSince())
      .map((event) => ({
        date: event.date,
        label: EVENT_TYPE_LABELS[event.type] ?? event.type_label,
      })),
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
    const versus = changeVsLastYear !== null ? 'a year ago' : 'the previous image';
    return {
      value: decimal(latest.mean),
      caption: `Image from ${formatDate(latest.date)}`,
      trend: change === null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      trendText:
        change === null
          ? null
          : change === 0
            ? `Same as ${versus}`
            : `${signedDecimal(change)} vs. ${versus}`,
    };
  });
  protected readonly rainKpi = computed<KpiView | null>(() => {
    const rain = this.rainLast30();
    if (!rain || rain.rainMm === null) return null;
    const missing = rain.missingDays > 0 ? ` · ${missingText(rain.missingDays)}` : '';
    return {
      value: Math.round(rain.rainMm),
      caption: `Up to ${formatDate(rain.to).slice(0, 5)}${missing}`,
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
      caption: `${root ? 'Root zone' : 'Surface'} · 100 is saturated`,
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
        note: 'current month: no data yet',
        aside: `* ${label}: no data yet`,
      };
    }
    const until = `${lastRain.slice(8, 10)}/${lastRain.slice(5, 7)}`;
    const gaps = inMonth.filter((day) => day.rainMm === null && day.date < lastRain).length;
    return {
      month,
      note: `current month: up to ${until}${gaps ? `, ${missingText(gaps)}` : ''}`,
      aside: `* ${label}: total up to ${until}`,
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
      status === 'partial' ? 'The catalog query partly failed.' : 'The catalog query failed.';
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
    [this.ndvi(), this.climate(), this.scenes(), this.landUse()].some(
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
    this.watchWidth();
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

  /** por qué un indicador quedó sin dato, en pocas palabras: la primera oración del motivo */
  protected reason(state: LoadState<unknown>): string {
    if (this.pending(state)) return this.offlineText;
    return firstSentence(serviceText(state.error)) || 'The service returned no data for this field';
  }

  protected number(value: number | null | undefined, digits = 2): string {
    return value == null
      ? 'No data'
      : value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  protected signed(value: number | null): string {
    return value === null ? 'No data' : signedDecimal(value);
  }

  protected day(iso: string): string {
    return formatDate(iso.slice(0, 10));
  }

  protected percent(value: number | null): string {
    return value === null ? 'No data' : `${Math.round(value * 100)}%`;
  }

  /** sigue si la pantalla es de celular (sin matchMedia, como en las pruebas, es la de compu) */
  private watchWidth(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(NARROW_QUERY);
    this.narrow.set(query.matches);
    const onChange = (change: MediaQueryListEvent) => this.narrow.set(change.matches);
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }

  /** "2 de 6: Pasadas de NISAR", el nombre de cada tarjeta deslizable */
  protected slideLabel(index: number): string {
    return `${index + 1} of ${this.slides.length}: ${this.slides[index]}`;
  }

  /** lo que vio MODIS un año: "Agrícola", "Natural (pastizal)", "Agua", "Uso mixto" o "Sin dato" */
  protected landUseYear(year: LandUseYear): string {
    if (!year.pixels) return 'No data';
    if (!year.group) return 'Mixed use';
    const label = LAND_USE_GROUP_LABELS[year.group];
    if (year.group === 'agricultural' || year.group === 'urban' || !year.classLabel) return label;
    return year.group === 'other' ? year.classLabel : `${label} (${year.classLabel.toLowerCase()})`;
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
  return days === 1 ? '1 day without data' : `${days} days without data`;
}

/** 0.6234 -> '0,62' */
function decimal(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 0.12 -> '+0,12'; -0.05 -> '−0,05' */
function signedDecimal(value: number): string {
  const text = Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}`;
}
