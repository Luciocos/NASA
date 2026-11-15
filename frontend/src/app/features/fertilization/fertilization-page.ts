import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { Api } from '../../core/api';
import { AuthSession } from '../../core/auth/auth-session';
import { formatHectares } from '../../core/insights';
import { Footprint, FootprintComponent, LotDetail } from '../../core/models';
import {
  DATA_SOURCES,
  LoadState,
  LotSatellite,
  NdviGrid,
  NdviZoneLevel,
  zonesByTerciles,
} from '../../core/nasa';
import { OFFLINE_STORAGE } from '../../core/offline/storage';
import { OriginBadge } from '../../shared/origin-badge/origin-badge';
import { Disclosure } from '../../shared/ui/disclosure/disclosure';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiCard } from '../../shared/ui/kpi-card/kpi-card';
import { LoginInvite } from '../../shared/ui/login-invite/login-invite';
import { LotTabs } from '../../shared/ui/lot-tabs/lot-tabs';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { SectionCard } from '../../shared/ui/section-card/section-card';
import { formatDate } from '../lot/labels';
import { InfoTip } from '../../shared/ui/info-tip/info-tip';
import { ZONE_STYLE, ZonesMap } from './zones-map';

// las dosis van a nombre del usuario: lotestigo:u<id>:fertilization:v1 (se borran al salir).
// sin sesión no se guardan: la planilla vive mientras la pantalla esté abierta
const STORAGE_NAME = 'fertilization:v1';
const LEVELS: NdviZoneLevel[] = ['alto', 'medio', 'bajo'];
type Doses = Record<NdviZoneLevel, number | null>;

/** id del lote de un input o de la ruta: un número o su texto; vacío = no llegó */
function toLotId(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return Number(value);
}

/**
 * fertilización: el mapa de ambientes del lote según el NDVI de MODIS (tercios del rango, sin
 * umbrales inventados) es lo principal, con la superficie de cada ambiente. la planilla de dosis
 * variable de nitrógeno la completa el productor (dato declarado) y queda plegada hasta que la
 * pide. las emisiones salen de los factores con fuente del backend (los mismos de la huella)
 *
 * sirve como página (/lotes/:id/fertilizacion, con el encabezado y las pestañas del lote) y
 * adentro del popup del lote: `<app-fertilization-page [id]="lot.id" [embedded]="true" />`.
 * embebida no muestra app-lot-tabs ni su encabezado (la acción principal pasa a la planilla)
 */
@Component({
  selector: 'app-fertilization-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LotTabs,
    ZonesMap,
    OriginBadge,
    PageHeader,
    SectionCard,
    KpiCard,
    Disclosure,
    Icon,
    LoginInvite,
    InfoTip,
  ],
  host: { '[class.is-embedded]': 'embedded()' },
  templateUrl: './fertilization-page.html',
  styleUrl: './fertilization-page.css',
})
export class FertilizationPage {
  private readonly api = inject(Api);
  private readonly satellite = inject(LotSatellite);
  private readonly storage = inject(OFFLINE_STORAGE);
  private readonly session = inject(AuthSession);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** id del lote; si no llega, sale del parámetro :id de la ruta */
  readonly id = input<number | undefined, unknown>(undefined, { transform: toLotId });
  /** adentro del popup del lote: sin app-lot-tabs ni encabezado propio */
  readonly embedded = input(false, { transform: booleanAttribute });
  /** la ficha del lote, si quien la muestra ya la tiene (el popup): no se vuelve a pedir */
  readonly lotDetail = input<LotDetail | null>(null);

  private readonly routeId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => toLotId(params.get('id')))),
    { initialValue: undefined },
  );
  /** el id en uso: el del input o el de la ruta (NaN si ninguno sirve) */
  protected readonly lotId = computed(() => this.id() ?? this.routeId() ?? NaN);
  protected readonly lot = signal<LotDetail | null>(null);
  protected readonly footprint = signal<Footprint | null>(null);
  /** el lote no existe o es de otra cuenta (404) */
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly gridState = signal<(() => LoadState<NdviGrid>) | null>(null);
  protected readonly doses = signal<Doses>({ alto: null, medio: null, bajo: null });
  /** lo tipeado en cada dosis, para no pisarlo mientras se escribe */
  private readonly drafts = signal<Partial<Record<NdviZoneLevel, string>>>({});
  /** la planilla de dosis está plegada hasta que se pide */
  protected readonly plannerOpen = signal(false);
  private readonly plannerButton = viewChild<ElementRef<HTMLButtonElement>>('plannerButton');

  protected readonly levels = LEVELS;
  protected readonly zoneStyle = ZONE_STYLE;
  protected readonly modis = DATA_SOURCES.modisNdvi;
  protected readonly formatHectares = formatHectares;
  protected readonly formatDate = formatDate;

  protected readonly grid = computed(() => this.gridState()?.() ?? null);
  /** el NDVI todavía no llegó: los ambientes se muestran como esqueleto */
  protected readonly loadingGrid = computed(() => {
    const state = this.grid();
    return (
      this.lot() === null || state === null || state.status === 'idle' || state.status === 'loading'
    );
  });
  protected readonly zones = computed(() => {
    const data = this.grid()?.data;
    return data ? zonesByTerciles(data) : null;
  });
  protected readonly hasZones = computed(() => (this.zones()?.zones.length ?? 0) > 0);
  protected readonly rows = computed(() => {
    const area = this.lot()?.area_ha ?? 0;
    return (this.zones()?.zones ?? []).map((zone) => {
      const ha = zone.share * area;
      const dose = this.doses()[zone.level];
      return { zone, ha, dose, totalN: dose === null ? null : dose * ha };
    });
  });
  protected readonly dosesHint = computed(() => {
    const rows = this.rows();
    const loaded = rows.filter((row) => row.dose !== null).length;
    return `${loaded} de ${rows.length} ambientes con dosis`;
  });
  private readonly component = (key: string): FootprintComponent | null =>
    this.footprint()?.components.find((item) => item.key === key) ?? null;
  protected readonly nitrogen = computed(() => this.component('fertilizer_n_production'));
  protected readonly phosphorus = computed(() => this.component('fertilizer_p_production'));
  protected readonly soilN2o = computed(() => this.component('soil_n2o'));
  /** kg CO2e por kg de N: producción del fertilizante más N2O directo del suelo */
  protected readonly factorN = computed(() => {
    const production = this.nitrogen()?.factor;
    const soil = this.soilN2o()?.factor;
    if (!production?.validated || !soil?.validated) return null;
    if (production.value == null || soil.value == null) return null;
    return production.value + soil.value;
  });
  protected readonly uniformDose = computed(() => this.nitrogen()?.activity.quantity ?? null);
  protected readonly plan = computed(() => {
    const rows = this.rows();
    const area = this.lot()?.area_ha ?? 0;
    const complete = rows.length > 0 && rows.every((row) => row.totalN !== null);
    const variableN = complete ? rows.reduce((sum, row) => sum + (row.totalN ?? 0), 0) : null;
    const uniform = this.uniformDose();
    const uniformN = uniform === null ? null : uniform * area;
    const factor = this.factorN();
    return {
      variableN,
      uniformN,
      deltaN: variableN !== null && uniformN !== null ? variableN - uniformN : null,
      variableCo2: variableN !== null && factor !== null ? variableN * factor : null,
      uniformCo2: uniformN !== null && factor !== null ? uniformN * factor : null,
      averageDose: variableN !== null && area > 0 ? variableN / area : null,
    };
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.lotId();
      if (!Number.isInteger(id)) {
        this.error.set('El identificador del lote no es válido.');
        return;
      }
      this.doses.set(this.loadDoses(id));
      this.drafts.set({});
      const useLot = (lot: LotDetail) => {
        this.lot.set(lot);
        this.gridState.set(this.satellite.ndviGrid({ id: lot.id, geometry: lot.geometry }));
      };
      const subs = [
        this.api.footprint(id).subscribe({
          next: (fp) => this.footprint.set(fp),
          error: () => this.footprint.set(null),
        }),
      ];
      // el popup ya tiene la ficha: se usa esa (la superficie y el polígono no cambian)
      const given = untracked(this.lotDetail);
      if (given?.id === id) {
        untracked(() => useLot(given));
      } else {
        subs.push(
          this.api.lot(id).subscribe({
            next: useLot,
            error: (err: { status?: number }) => {
              if (err.status === 404) this.notFound.set(true);
              else this.error.set('No se pudo cargar el lote. Revisá la conexión.');
            },
          }),
        );
      }
      onCleanup(() => subs.forEach((sub) => sub.unsubscribe()));
    });
  }

  /**
   * la persona abre o cierra la planilla con su rótulo. en el popup, cerrada vuelve "Armar dosis"
   * a su lugar y el foco va ahí, así no se pierde con el rótulo que desaparece
   */
  protected togglePlanner(open: boolean): void {
    this.plannerOpen.set(open);
    if (open || !this.embedded()) return;
    afterNextRender(() => this.plannerButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** la acción principal: abre la planilla y lleva el foco a la primera dosis */
  protected openPlanner(): void {
    this.plannerOpen.set(true);
    afterNextRender(
      () => {
        const input = this.host.nativeElement.querySelector<HTMLInputElement>('.dose input');
        input?.focus({ preventScroll: true });
        input?.scrollIntoView({ block: 'center' });
      },
      { injector: this.injector },
    );
  }

  /** el texto de una dosis: lo tipeado o lo guardado, con coma decimal */
  protected doseText(level: NdviZoneLevel): string {
    const typed = this.drafts()[level];
    if (typed !== undefined) return typed;
    const dose = this.doses()[level];
    return dose === null ? '' : String(dose).replace('.', ',');
  }

  protected setDose(level: NdviZoneLevel, raw: string): void {
    const text = raw.trim().replace(',', '.');
    const value = text === '' ? null : Number(text);
    const dose = value !== null && Number.isFinite(value) && value >= 0 ? value : null;
    this.drafts.update((drafts) => ({ ...drafts, [level]: raw }));
    this.doses.update((doses) => ({ ...doses, [level]: dose }));
    this.saveDoses(this.lotId(), this.doses());
  }

  protected retry(): void {
    const lot = this.lot();
    if (lot) this.satellite.retry({ id: lot.id, geometry: lot.geometry });
  }

  protected number(value: number | null | undefined, digits = 0): string {
    return value == null
      ? 'Sin dato'
      : value.toLocaleString('es-AR', { maximumFractionDigits: digits });
  }

  protected percent(value: number): string {
    return `${Math.round(value * 100)} %`;
  }

  /** superficie de un ambiente para la tarjeta: "18,2" */
  protected hectares(value: number): string {
    return value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
  }

  private loadDoses(lotId: number): Doses {
    const empty = { alto: null, medio: null, bajo: null };
    const storageKey = this.session.userKey(STORAGE_NAME);
    if (storageKey === null) return empty;
    try {
      const all = JSON.parse(this.storage.getItem(storageKey) ?? '{}') as Record<string, Doses>;
      const saved = all[String(lotId)];
      if (!saved) return empty;
      const pick = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      return { alto: pick(saved.alto), medio: pick(saved.medio), bajo: pick(saved.bajo) };
    } catch {
      return empty;
    }
  }

  private saveDoses(lotId: number, doses: Doses): void {
    const storageKey = this.session.userKey(STORAGE_NAME);
    if (storageKey === null) return;
    try {
      const all = JSON.parse(this.storage.getItem(storageKey) ?? '{}') as Record<string, unknown>;
      all[String(lotId)] = doses;
      this.storage.setItem(storageKey, JSON.stringify(all));
    } catch {
      // sin almacenamiento la planilla sigue andando mientras la pestaña esté abierta
    }
  }
}
