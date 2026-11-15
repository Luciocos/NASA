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

import { Api } from '../../../core/api';
import { formatHectares } from '../../../core/insights';
import { Footprint, LotDetail } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { LotTabs } from '../../../shared/ui/lot-tabs/lot-tabs';
import { WaterfallChart, WaterfallStep } from '../../../shared/charts';
import {
  COST_KEYS,
  COST_LABELS,
  CostKey,
  ProfitInputs,
  computeProfit,
  emptyProfitInputs,
  formatUsd,
  sensitivity,
} from '../profit-calc';
import { ProfitStore } from '../profit-store';

/**
 * rentabilidad del lote: margen bruto por hectárea y del lote entero, rinde de indiferencia y
 * sensibilidad a precio y rinde. el área y el rinde salen del backend (rinde declarado o valor
 * de referencia con su fuente); precio y costos los declara el productor
 */
@Component({
  selector: 'app-profit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OriginBadge, LotTabs, WaterfallChart],
  templateUrl: './profit-page.html',
  styleUrl: './profit-page.css',
})
export class ProfitPage {
  private readonly api = inject(Api);
  private readonly store = inject(ProfitStore);

  protected readonly lotId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => Number(params.get('id')))),
    { initialValue: NaN },
  );
  protected readonly lot = signal<LotDetail | null>(null);
  protected readonly footprint = signal<Footprint | null>(null);
  protected readonly error = signal<string | null>(null);
  /** id de la campaña elegida; null usa la última */
  protected readonly campaignId = signal<number | null>(null);
  protected readonly inputs = signal<ProfitInputs>(emptyProfitInputs());

  protected readonly costKeys = COST_KEYS;
  protected readonly costLabels = COST_LABELS;
  protected readonly formatUsd = formatUsd;
  protected readonly formatHectares = formatHectares;

  protected readonly campaignLabel = computed(() => this.footprint()?.campaign?.label ?? null);
  protected readonly yieldTHa = computed(() => this.footprint()?.yield.value ?? null);
  protected readonly area = computed(() => this.lot()?.area_ha ?? 0);
  protected readonly result = computed(() =>
    computeProfit(this.inputs(), this.yieldTHa(), this.area()),
  );
  protected readonly table = computed(() => {
    const y = this.yieldTHa();
    return y === null || this.inputs().priceUsdT === null ? [] : sensitivity(this.inputs(), y);
  });
  /** cascada del margen por hectárea con los conceptos cargados (los vacíos no se dibujan) */
  protected readonly waterfall = computed<WaterfallStep[]>(() => {
    const r = this.result();
    if (r.grossUsdHa === null || r.marginUsdHa === null) return [];
    const steps: WaterfallStep[] = [{ label: 'Ingreso bruto', value: r.grossUsdHa, kind: 'total' }];
    if (r.commercialUsdHa) {
      steps.push({ label: 'Comercialización', value: -r.commercialUsdHa, kind: 'delta' });
    }
    for (const key of COST_KEYS) {
      const cost = this.inputs().costs[key];
      if (cost) steps.push({ label: COST_LABELS[key], value: -cost, kind: 'delta' });
    }
    steps.push({ label: 'Margen bruto', value: r.marginUsdHa, kind: 'total' });
    return steps;
  });
  protected readonly breakdown = computed(() => {
    const r = this.result();
    const area = this.area();
    const rows: { label: string; perHa: number | null; sign: 1 | -1 }[] = [
      { label: 'Ingreso bruto', perHa: r.grossUsdHa, sign: 1 },
      { label: 'Comercialización y flete', perHa: r.commercialUsdHa, sign: -1 },
      ...COST_KEYS.map((key) => ({
        label: COST_LABELS[key],
        perHa: this.inputs().costs[key],
        sign: -1 as const,
      })),
    ];
    return rows.map((row) => ({
      ...row,
      total: row.perHa === null ? null : row.perHa * area,
    }));
  });
  /** emisiones por hectárea y por dólar de margen, si la huella está completa */
  protected readonly carbon = computed(() => {
    const perT = this.footprint()?.total_kg_co2e_per_t ?? null;
    const y = this.yieldTHa();
    if (perT === null || y === null) return null;
    const perHa = perT * y;
    const margin = this.result().marginUsdHa;
    return { perHa, perUsd: margin !== null && margin > 0 ? perHa / margin : null };
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
        error: (err: { status?: number }) =>
          this.error.set(
            err.status === 404
              ? 'No existe un lote con ese identificador.'
              : 'No se pudo cargar el lote. Revisá la conexión.',
          ),
      });
      onCleanup(() => sub.unsubscribe());
    });

    effect((onCleanup) => {
      const id = this.lotId();
      if (!Number.isInteger(id)) return;
      const sub = this.api.footprint(id, this.campaignId()).subscribe({
        next: (fp) => this.footprint.set(fp),
        error: () => this.footprint.set(null),
      });
      onCleanup(() => sub.unsubscribe());
    });

    // al cambiar de lote o campaña se cargan los valores guardados de esa campaña
    effect(() => {
      const id = this.lotId();
      const label = this.campaignLabel();
      if (Number.isInteger(id) && label) this.inputs.set(this.store.load(id, label));
    });
  }

  protected onCampaign(value: string): void {
    this.campaignId.set(value === '' ? null : Number(value));
  }

  protected setPrice(raw: string): void {
    this.update({ ...this.inputs(), priceUsdT: parse(raw) });
  }

  protected setCommercial(raw: string): void {
    this.update({ ...this.inputs(), commercialUsdT: parse(raw) });
  }

  protected setCost(key: CostKey, raw: string): void {
    const inputs = this.inputs();
    this.update({ ...inputs, costs: { ...inputs.costs, [key]: parse(raw) } });
  }

  protected percent(step: number): string {
    return step === 0 ? 'Actual' : `${step > 0 ? '+' : ''}${Math.round(step * 100)} %`;
  }

  protected number(value: number | null, digits = 2): string {
    return value === null
      ? 'Sin dato'
      : value.toLocaleString('es-AR', { maximumFractionDigits: digits });
  }

  private update(inputs: ProfitInputs): void {
    this.inputs.set(inputs);
    const id = this.lotId();
    const label = this.campaignLabel();
    if (Number.isInteger(id) && label) this.store.save(id, label, inputs);
  }
}

/** campo vacío o inválido: null. acepta coma decimal */
function parse(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
