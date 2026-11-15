import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { Api } from '../../core/api';
import { LotDetail } from '../../core/models';
import { OriginBadge } from '../../shared/origin-badge/origin-badge';
import { Disclosure } from '../../shared/ui/disclosure/disclosure';
import { Icon } from '../../shared/ui/icon/icon';
import { LoginInvite } from '../../shared/ui/login-invite/login-invite';
import { LotTabs } from '../../shared/ui/lot-tabs/lot-tabs';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { SectionCard } from '../../shared/ui/section-card/section-card';
import { formatDate } from '../lot/labels';
import { HydroChart, HydroSeries } from './hydro-chart';
import { OutletPick, WaterApi } from './water-api';
import { WATER_STYLE, WaterMap } from './water-map';
import { Arc, Hsg, RainEvent, WaterAnalysis, WaterHistory, WaterSimulation } from './water.types';

export type WaterSection = 'basin' | 'history' | 'simulator' | 'impact';

const SECTIONS: { key: WaterSection; label: string }[] = [
  { key: 'basin', label: 'Cuenca aportante' },
  { key: 'history', label: 'Historial hidrológico' },
  { key: 'simulator', label: 'Simulador de lluvia' },
  { key: 'impact', label: 'Impacto sobre el lote' },
];

export const RAIN_PRESETS = [30, 60, 100];
export const DURATIONS_H = [1, 3, 6, 12, 24];
export const ARC_LABELS: Record<Arc, string> = {
  I: 'Suelo seco (ARC I)',
  II: 'Humedad media (ARC II)',
  III: 'Suelo húmedo (ARC III)',
};
const COMPARE_COLORS = ['#0b6bcb', '#e76f51', '#2a9d8f', '#8e44ad'];
const MAX_COMPARE = 4;

function toLotId(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return Number(value);
}

export const num = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined
    ? '—'
    : v.toLocaleString('es-AR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** escenario guardado para comparar en el simulador */
interface SavedScenario {
  label: string;
  sim: WaterSimulation;
}

/**
 * Cuenca y Caudal: de dónde viene el agua que llega al lote, cuánto escurre con una lluvia y
 * dónde se junta. Configurado para el Lote 3 (Casilda). Todo es estimación de un modelo físico
 * (SCS-CN e hidrograma unitario SCS): no hay caudales medidos en la cuenca
 *
 * sirve como página (/lotes/:id/cuenca) y adentro del popup del lote (embedded)
 */
@Component({
  selector: 'app-water-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LotTabs,
    PageHeader,
    SectionCard,
    OriginBadge,
    Disclosure,
    Icon,
    LoginInvite,
    WaterMap,
    HydroChart,
    KeyValuePipe,
  ],
  host: { '[class.is-embedded]': 'embedded()' },
  templateUrl: './water-page.html',
  styleUrl: './water-page.css',
})
export class WaterPage {
  private readonly api = inject(Api);
  private readonly water = inject(WaterApi);

  readonly id = input<number | undefined, unknown>(undefined, { transform: toLotId });
  readonly embedded = input(false, { transform: booleanAttribute });

  private readonly routeId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => toLotId(params.get('id')))),
    { initialValue: undefined },
  );
  protected readonly lotId = computed(() => this.id() ?? this.routeId() ?? NaN);

  protected readonly lot = signal<LotDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  /** el backend no tiene la cuenca de este lote (fuera de la zona procesada) */
  protected readonly unavailable = signal<string | null>(null);
  protected readonly analysis = signal<WaterAnalysis | null>(null);
  protected readonly loadingAnalysis = signal(false);
  protected readonly outlet = signal<OutletPick | null>(null);
  protected readonly section = signal<WaterSection>('basin');

  protected readonly history = signal<WaterHistory | null>(null);
  protected readonly historyError = signal<string | null>(null);
  protected readonly loadingHistory = signal(false);
  protected readonly selectedEvent = signal<string | null>(null);
  protected readonly compareEvents = signal<string[]>([]);

  protected readonly rainMm = signal(60);
  protected readonly durationH = signal(6);
  protected readonly arc = signal<Arc>('II');
  protected readonly hsg = signal<Hsg | null>(null);
  protected readonly residue = signal(true);
  protected readonly simulation = signal<WaterSimulation | null>(null);
  protected readonly simulating = signal(false);
  protected readonly simError = signal<string | null>(null);
  protected readonly saved = signal<SavedScenario[]>([]);

  protected readonly sections = SECTIONS;
  protected readonly presets = RAIN_PRESETS;
  protected readonly durations = DURATIONS_H;
  protected readonly arcs: Arc[] = ['I', 'II', 'III'];
  protected readonly arcLabels = ARC_LABELS;
  protected readonly hsgs: Hsg[] = ['A', 'B', 'C', 'D'];
  protected readonly style = WATER_STYLE;
  protected readonly num = num;
  protected readonly formatDate = formatDate;

  protected readonly event = computed<RainEvent | null>(() => {
    const events = this.history()?.events ?? [];
    const key = this.selectedEvent();
    return events.find((e) => e.start === key) ?? events[0] ?? null;
  });

  protected readonly eventSeries = computed<HydroSeries[]>(() => {
    const events = this.history()?.events ?? [];
    const main = this.event();
    if (!main) return [];
    const others = this.compareEvents()
      .filter((k) => k !== main.start)
      .map((k) => events.find((e) => e.start === k))
      .filter((e): e is RainEvent => !!e);
    return [main, ...others].map((e, i) => ({
      label: `${this.eventLabel(e)} · ${num(e.rain_mm)} mm`,
      hydrograph: e.hydrograph,
      color: COMPARE_COLORS[i % COMPARE_COLORS.length],
      dash: i ? '5 3' : undefined,
    }));
  });

  protected readonly scenarioSeries = computed<HydroSeries[]>(() => {
    const current = this.simulation();
    const list: HydroSeries[] = this.saved().map((s, i) => ({
      label: s.label,
      hydrograph: s.sim.result.hydrograph,
      color: COMPARE_COLORS[(i + 1) % COMPARE_COLORS.length],
      dash: '5 3',
    }));
    if (current) {
      list.unshift({
        label: `Actual: ${this.scenarioLabel(current)}`,
        hydrograph: current.result.hydrograph,
        color: COMPARE_COLORS[0],
      });
    }
    return list;
  });

  protected readonly topEntries = computed(() => this.analysis()?.entries ?? []);
  protected readonly externalShare = computed(() => {
    const c = this.analysis()?.contributing;
    return c && c.area_ha > 0 ? c.outside_lot_ha / c.area_ha : null;
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.lotId();
      if (!Number.isInteger(id)) {
        this.error.set('El identificador del lote no es válido.');
        return;
      }
      const sub = this.api.lot(id).subscribe({
        next: (lot) => this.lot.set(lot),
        error: (err: { status?: number }) => {
          if (err.status === 404) this.notFound.set(true);
          else this.error.set('No se pudo cargar el lote. Revisá la conexión.');
        },
      });
      onCleanup(() => sub.unsubscribe());
    });

    // la cuenca se recalcula cada vez que cambia el punto de salida
    effect((onCleanup) => {
      const id = this.lotId();
      const outlet = this.outlet();
      if (!Number.isInteger(id)) return;
      this.loadingAnalysis.set(true);
      const sub = this.water.analysis(id, outlet).subscribe({
        next: (a) => {
          this.analysis.set(a);
          this.unavailable.set(null);
          this.loadingAnalysis.set(false);
        },
        error: (err: { status?: number; error?: { available?: boolean; detail?: string } }) => {
          this.loadingAnalysis.set(false);
          if (err.status === 404 && err.error?.available === false) {
            this.unavailable.set(err.error.detail ?? 'Sin análisis para este lote.');
          } else if (err.status === 404) {
            this.notFound.set(true);
          } else {
            this.error.set('No se pudo calcular la cuenca. Probá de nuevo en un rato.');
          }
        },
      });
      onCleanup(() => sub.unsubscribe());
    });

    // el historial se pide al abrir su sección (o al mover el punto de salida estando ahí)
    effect((onCleanup) => {
      const id = this.lotId();
      const outlet = this.outlet();
      if (!Number.isInteger(id) || this.section() !== 'history' || this.unavailable()) return;
      this.loadingHistory.set(true);
      this.historyError.set(null);
      const sub = this.water.history(id, outlet).subscribe({
        next: (h) => {
          this.history.set(h);
          this.loadingHistory.set(false);
        },
        error: (err: { error?: { detail?: string } }) => {
          this.loadingHistory.set(false);
          this.historyError.set(err.error?.detail ?? 'No se pudo cargar el historial.');
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected selectSection(key: WaterSection): void {
    this.section.set(key);
    if (key === 'simulator' && !this.simulation() && !this.simulating()) this.runSimulation();
  }

  /** otro punto de salida (null vuelve a la salida principal del lote) */
  protected pickOutlet(pick: OutletPick | null): void {
    this.outlet.set(pick);
    this.simulation.set(null);
    this.saved.set([]);
    if (this.section() === 'simulator') this.runSimulation();
  }

  protected setRain(value: number | string): void {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1 && n <= 500) this.rainMm.set(n);
  }

  protected runSimulation(): void {
    const id = this.lotId();
    if (!Number.isInteger(id)) return;
    const outlet = this.outlet();
    const hsg = this.hsg();
    this.simulating.set(true);
    this.simError.set(null);
    this.water
      .simulate(id, {
        rain_mm: this.rainMm(),
        duration_h: this.durationH(),
        arc: this.arc(),
        residue: this.residue(),
        ...(hsg ? { hsg } : {}),
        ...(outlet ? { lat: outlet.lat, lng: outlet.lng } : {}),
      })
      .subscribe({
        next: (sim) => {
          this.simulation.set(sim);
          this.simulating.set(false);
        },
        error: (err: { error?: { detail?: string } }) => {
          this.simulating.set(false);
          this.simError.set(err.error?.detail ?? 'No se pudo simular. Revisá los valores.');
        },
      });
  }

  protected saveScenario(): void {
    const sim = this.simulation();
    if (!sim) return;
    this.saved.update((list) =>
      [...list, { label: this.scenarioLabel(sim), sim }].slice(-(MAX_COMPARE - 1)),
    );
  }

  protected removeScenario(index: number): void {
    this.saved.update((list) => list.filter((_, i) => i !== index));
  }

  protected toggleCompare(event: RainEvent): void {
    this.compareEvents.update((list) =>
      list.includes(event.start)
        ? list.filter((k) => k !== event.start)
        : [...list, event.start].slice(-(MAX_COMPARE - 1)),
    );
  }

  protected scenarioLabel(sim: WaterSimulation): string {
    const s = sim.scenario;
    return `${num(s.rain_mm)} mm en ${num(s.duration_h)} h · ARC ${s.arc} · suelo ${s.hsg}${s.residue ? '' : ' · sin rastrojo'}`;
  }

  protected eventLabel(e: RainEvent): string {
    // fechas en hora de Argentina (UTC-3), que es como se recuerda una lluvia
    const d = new Date(e.start);
    return d.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  }

  protected eventTime(e: RainEvent): string {
    return new Date(e.start).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  }

  protected percent(share: number | null | undefined): string {
    return share === null || share === undefined ? '—' : `${num(share * 100, 0)} %`;
  }

  protected km(m: number): string {
    return m >= 1000 ? `${num(m / 1000, 2)} km` : `${num(m, 0)} m`;
  }
}
