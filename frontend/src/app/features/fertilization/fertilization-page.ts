import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { Api } from '../../core/api';
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
import { LotTabs } from '../../shared/ui/lot-tabs/lot-tabs';
import { ZONE_STYLE, ZonesMap } from './zones-map';

const STORAGE_KEY = 'lotestigo:fertilization:v1';
const LEVELS: NdviZoneLevel[] = ['alto', 'medio', 'bajo'];

/**
 * fertilización: ambientes del lote según el NDVI de MODIS (tercios del rango, sin umbrales
 * inventados) y una planilla de dosis variable de nitrógeno que el productor completa. las
 * emisiones salen de los factores con fuente del backend (los mismos de la huella)
 */
@Component({
  selector: 'app-fertilization-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LotTabs, ZonesMap, OriginBadge],
  templateUrl: './fertilization-page.html',
  styleUrl: './fertilization-page.css',
})
export class FertilizationPage {
  private readonly api = inject(Api);
  private readonly satellite = inject(LotSatellite);
  private readonly storage = inject(OFFLINE_STORAGE);

  protected readonly lotId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => Number(params.get('id')))),
    { initialValue: NaN },
  );
  protected readonly lot = signal<LotDetail | null>(null);
  protected readonly footprint = signal<Footprint | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly gridState = signal<(() => LoadState<NdviGrid>) | null>(null);
  protected readonly doses = signal<Record<NdviZoneLevel, number | null>>({
    alto: null,
    medio: null,
    bajo: null,
  });

  protected readonly levels = LEVELS;
  protected readonly zoneStyle = ZONE_STYLE;
  protected readonly modis = DATA_SOURCES.modisNdvi;
  protected readonly formatHectares = formatHectares;

  protected readonly grid = computed(() => this.gridState()?.() ?? null);
  protected readonly zones = computed(() => {
    const data = this.grid()?.data;
    return data ? zonesByTerciles(data) : null;
  });
  protected readonly rows = computed(() => {
    const area = this.lot()?.area_ha ?? 0;
    return (this.zones()?.zones ?? []).map((zone) => {
      const ha = zone.share * area;
      const dose = this.doses()[zone.level];
      return { zone, ha, dose, totalN: dose === null ? null : dose * ha };
    });
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
      const subs = [
        this.api.lot(id).subscribe({
          next: (lot) => {
            this.lot.set(lot);
            this.gridState.set(this.satellite.ndviGrid({ id: lot.id, geometry: lot.geometry }));
          },
          error: () => this.error.set('No se pudo cargar el lote. Revisá la conexión.'),
        }),
        this.api.footprint(id).subscribe({
          next: (fp) => this.footprint.set(fp),
          error: () => this.footprint.set(null),
        }),
      ];
      onCleanup(() => subs.forEach((sub) => sub.unsubscribe()));
    });
  }

  protected setDose(level: NdviZoneLevel, raw: string): void {
    const text = raw.trim().replace(',', '.');
    const value = text === '' ? null : Number(text);
    const dose = value !== null && Number.isFinite(value) && value >= 0 ? value : null;
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

  private loadDoses(lotId: number): Record<NdviZoneLevel, number | null> {
    const empty = { alto: null, medio: null, bajo: null };
    try {
      const all = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '{}') as Record<
        string,
        Record<NdviZoneLevel, number | null>
      >;
      const saved = all[String(lotId)];
      if (!saved) return empty;
      const pick = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      return { alto: pick(saved.alto), medio: pick(saved.medio), bajo: pick(saved.bajo) };
    } catch {
      return empty;
    }
  }

  private saveDoses(lotId: number, doses: Record<NdviZoneLevel, number | null>): void {
    try {
      const all = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
      all[String(lotId)] = doses;
      this.storage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // sin almacenamiento la planilla sigue andando mientras la pestaña esté abierta
    }
  }
}
