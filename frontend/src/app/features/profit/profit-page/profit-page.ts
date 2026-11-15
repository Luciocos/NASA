import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, map } from 'rxjs';

import { Api } from '../../../core/api';
import { AuthSession } from '../../../core/auth/auth-session';
import { formatHectares } from '../../../core/insights';
import { Footprint, LotDetail, Origin, SuggestedPrice } from '../../../core/models';
import { WaterfallChart, WaterfallStep } from '../../../shared/charts';
import { InfoTip } from '../../../shared/ui/info-tip/info-tip';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { LoginInvite } from '../../../shared/ui/login-invite/login-invite';
import { LotTabs } from '../../../shared/ui/lot-tabs/lot-tabs';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
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
import { NO_CAMPAIGN, ProfitStore } from '../profit-store';

/** campos que se escriben a mano: el texto se guarda tal cual mientras se tipea */
type FieldKey = 'price' | 'yield' | 'commercial' | CostKey;

/** flete y comercialización más los costos directos */
const COST_COUNT = COST_KEYS.length + 1;

/** id del lote de un input o de la ruta: un número o su texto; vacío = no llegó */
function toLotId(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return Number(value);
}

/**
 * rentabilidad del lote, una sola pregunta: ¿cuánto te deja? el margen bruto por hectárea y del
 * lote entero se recalcula mientras se cargan el precio y el rinde (el área sale del polígono).
 * los costos detallados, el desglose y la sensibilidad quedan plegados. el rinde viene de la
 * huella (declarado o de referencia, con su origen) y el productor puede poner el suyo; precio,
 * rinde propio y costos son datos declarados y se guardan por cuenta en ProfitStore
 *
 * en soja, el precio puede salir del sugerido de Matba Rofex (backend/market), que se pide recién
 * con el botón: queda estimado hasta que el productor lo cambie, con una línea de fuente y fecha
 * debajo del campo y el detalle en su (i). la sugerencia se guarda con los números de la campaña,
 * así al recargar el precio sigue estimado (y uno de prueba, rotulado)
 *
 * sirve como página (/lotes/:id/rentabilidad, con el encabezado y las pestañas del lote) y
 * adentro del popup del lote: `<app-profit-page [id]="lot.id" [embedded]="true" />`. embebida
 * no muestra app-lot-tabs ni su encabezado: el popup ya los muestra
 */
@Component({
  selector: 'app-profit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    OriginBadge,
    LotTabs,
    WaterfallChart,
    PageHeader,
    KpiCard,
    SectionCard,
    Disclosure,
    LoginInvite,
    InfoTip,
    Icon,
  ],
  host: { '[class.is-embedded]': 'embedded()' },
  templateUrl: './profit-page.html',
  styleUrl: './profit-page.css',
})
export class ProfitPage {
  private readonly api = inject(Api);
  private readonly store = inject(ProfitStore);
  private readonly session = inject(AuthSession);

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
  /** la huella no respondió: se calcula igual, sin el rinde de la huella */
  protected readonly footprintFailed = signal(false);
  /** el lote no existe o es de otra cuenta (404) */
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  /** id de la campaña elegida; null usa la última */
  protected readonly campaignId = signal<number | null>(null);
  protected readonly inputs = signal<ProfitInputs>(emptyProfitInputs());
  /** lo que se tipeó en cada campo desde que se abrió la campaña, para no pisarlo al recalcular */
  private readonly drafts = signal<Partial<Record<FieldKey, string>>>({});

  protected readonly costKeys = COST_KEYS;
  protected readonly costLabels = COST_LABELS;
  protected readonly formatUsd = formatUsd;
  protected readonly formatHectares = formatHectares;

  protected readonly signedIn = computed(() => this.session.user() !== null);
  protected readonly ready = computed(
    () => this.lot() !== null && (this.footprint() !== null || this.footprintFailed()),
  );
  protected readonly campaigns = computed(() => this.footprint()?.available_campaigns ?? []);
  protected readonly campaignLabel = computed(
    () => this.footprint()?.campaign?.label ?? NO_CAMPAIGN,
  );
  protected readonly area = computed(() => this.lot()?.area_ha ?? 0);

  /** precio sugerido de Rofex: solo hay contrato para soja (y se asume soja sin campaña) */
  protected readonly canSuggestPrice = computed(() => {
    const crop = this.footprint()?.campaign?.crop;
    return crop === undefined || crop === 'SOY';
  });
  protected readonly suggestion = signal<SuggestedPrice | null>(null);
  /** la sugerencia salió de lo guardado (puede ser de otro día): se ofrece pedirla de nuevo */
  protected readonly suggestionSaved = signal(false);
  protected readonly loadingSuggestion = signal(false);
  protected readonly suggestionError = signal<string | null>(null);
  /** el pedido a Rofex en curso: se corta si cambian el lote o la campaña */
  private suggestionRequest: Subscription | null = null;
  /** el precio es el sugerido mientras el productor no lo cambie; si lo cambia, es declarado */
  protected readonly priceOrigin = computed<Origin>(() => {
    const s = this.suggestion();
    return s !== null && this.inputs().priceUsdT === s.price_usd_t ? 'ESTIMATED' : 'DECLARED';
  });

  /** rinde de la huella: declarado en la campaña o valor de referencia regional */
  protected readonly huellaYield = computed(() => this.footprint()?.yield.value ?? null);
  /** el rinde con el que se calcula: el que cargó acá el productor o el de la huella */
  protected readonly yieldTHa = computed(() => this.inputs().yieldTHa ?? this.huellaYield());
  protected readonly yieldOrigin = computed<Origin | null>(() =>
    this.inputs().yieldTHa !== null ? 'DECLARED' : (this.footprint()?.yield.origin ?? null),
  );
  /** de dónde sale el rinde, en pocas palabras (la fuente de la referencia va en la ayuda) */
  protected readonly yieldNote = computed(() => {
    const huella = this.huellaYield();
    if (this.inputs().yieldTHa !== null) {
      return huella === null
        ? 'Entered by you'
        : `Entered by you · footprint: ${this.tons(huella)}`;
    }
    const fp = this.footprint();
    if (huella !== null && fp) {
      if (fp.yield.reference) return 'Regional reference, not from your field';
      return fp.yield.origin === 'DECLARED' ? 'From what you declared in Footprint' : '';
    }
    if (!fp) return 'No footprint data: enter it yourself';
    return fp.campaign
      ? `No yield declared for ${fp.campaign.label}: enter it yourself`
      : 'No seasons yet: enter it yourself';
  });
  /** fuente del rinde de referencia, solo cuando se usa */
  protected readonly yieldReference = computed(() =>
    this.inputs().yieldTHa === null && this.huellaYield() !== null
      ? (this.footprint()?.yield.reference ?? null)
      : null,
  );

  protected readonly result = computed(() =>
    computeProfit(this.inputs(), this.yieldTHa(), this.area()),
  );
  /** costos sin cargar, contando el flete */
  protected readonly pendingCosts = computed(
    () => this.result().missingCosts.length + (this.inputs().commercialUsdT === null ? 1 : 0),
  );
  protected readonly costsHint = computed(() => {
    const loaded = COST_COUNT - this.pendingCosts();
    const direct = this.result().directUsdHa;
    const total = direct > 0 ? ` · ${formatUsd(direct)}/ha` : '';
    return `${loaded} of ${COST_COUNT} entered${total}`;
  });

  /** número del margen para la tarjeta grande: sin "US$", que va como unidad */
  protected readonly marginHa = computed(() => amount(this.result().marginUsdHa));
  protected readonly marginTotal = computed(() => amount(this.result().marginTotalUsd));
  protected readonly negative = computed(() => (this.result().marginUsdHa ?? 0) < 0);
  /** por qué todavía no hay margen */
  protected readonly missingReason = computed(() => {
    const missing = this.result().missing;
    if (missing.length === 2) return 'Grain price and yield are missing.';
    if (missing.includes('precio')) return 'Grain price is missing.';
    return missing.includes('rinde') ? 'Yield is missing.' : null;
  });
  /** qué incluye el margen, en una línea */
  protected readonly marginCaption = computed(() => {
    const pending = this.pendingCosts();
    if (pending === COST_COUNT) return 'No costs yet: this is the income per hectare.';
    if (pending > 0) {
      return pending === 1
        ? '1 cost still to enter: the real margin is lower.'
        : `${pending} costs still to enter: the real margin is lower.`;
    }
    return this.negative()
      ? 'With all your costs, this field loses money.'
      : 'What is left after all your costs.';
  });
  /**
   * el margen usa precio y costos declarados; si el rinde es de referencia o el precio es el
   * sugerido de Rofex, es una estimación
   */
  protected readonly marginOrigin = computed<Origin>(() =>
    this.yieldOrigin() === 'ESTIMATED' || this.priceOrigin() === 'ESTIMATED'
      ? 'ESTIMATED'
      : 'DECLARED',
  );
  /**
   * con qué se calculó el margen, en pocas palabras: dice qué parte es estimada. un precio del
   * entorno de prueba de Rofex (reMarkets) no es de mercado: el margen también lo dice
   */
  protected readonly marginSource = computed(() => {
    const reference = this.yieldOrigin() === 'ESTIMATED';
    const rofex = this.priceOrigin() === 'ESTIMATED';
    const price = this.suggestion()?.simulated_market ? 'Rofex test price' : 'Rofex price';
    if (reference && rofex) return `With the reference yield and the ${price}`;
    if (reference) return 'With the reference yield';
    return rofex ? `With the ${price}` : 'With your data';
  });

  /** cascada del margen por hectárea con los conceptos cargados (los vacíos no se dibujan) */
  protected readonly waterfall = computed<WaterfallStep[]>(() => {
    const r = this.result();
    if (r.grossUsdHa === null || r.marginUsdHa === null) return [];
    const steps: WaterfallStep[] = [{ label: 'Gross income', value: r.grossUsdHa, kind: 'total' }];
    if (r.commercialUsdHa) {
      steps.push({ label: 'Freight and marketing', value: -r.commercialUsdHa, kind: 'delta' });
    }
    for (const key of COST_KEYS) {
      const cost = this.inputs().costs[key];
      if (cost) steps.push({ label: COST_LABELS[key], value: -cost, kind: 'delta' });
    }
    steps.push({ label: 'Gross margin', value: r.marginUsdHa, kind: 'total' });
    return steps;
  });
  protected readonly breakdown = computed(() => {
    const r = this.result();
    const area = this.area();
    const rows: { label: string; perHa: number | null; sign: 1 | -1 }[] = [
      { label: 'Gross income', perHa: r.grossUsdHa, sign: 1 },
      { label: 'Freight and marketing', perHa: r.commercialUsdHa, sign: -1 },
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
  protected readonly table = computed(() => {
    const y = this.yieldTHa();
    return y === null || this.inputs().priceUsdT === null ? [] : sensitivity(this.inputs(), y);
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
        this.error.set('The field ID is not valid.');
        return;
      }
      // el popup ya tiene la ficha: se usa esa (la superficie no cambia)
      const given = untracked(this.lotDetail);
      if (given?.id === id) {
        this.lot.set(given);
        return;
      }
      const sub = this.api.lot(id).subscribe({
        next: (lot) => this.lot.set(lot),
        error: (err: { status?: number }) => {
          if (err.status === 404) this.notFound.set(true);
          else this.error.set('Could not load the field. Check your connection.');
        },
      });
      onCleanup(() => sub.unsubscribe());
    });

    effect((onCleanup) => {
      const id = this.lotId();
      if (!Number.isInteger(id)) return;
      const sub = this.api.footprint(id, this.campaignId()).subscribe({
        next: (fp) => {
          this.footprint.set(fp);
          this.footprintFailed.set(false);
        },
        error: () => this.footprintFailed.set(true),
      });
      onCleanup(() => sub.unsubscribe());
    });

    // al cambiar de lote o campaña se cargan los valores guardados de esa campaña. el precio
    // sugerido que había era de otro contrato: se descarta, así no rotula como estimado un precio
    // propio. vuelve el que se guardó con los números de esta campaña, así un precio que vino de
    // Rofex sigue estimado (y uno de prueba, rotulado) después de recargar
    effect(() => {
      const id = this.lotId();
      const label = this.campaignLabel();
      if (!Number.isInteger(id) || !this.ready()) return;
      this.inputs.set(this.store.load(id, label));
      this.drafts.set({});
      untracked(() => {
        this.clearSuggestion();
        const saved = this.store.loadSuggestion(id, label);
        this.suggestion.set(saved);
        this.suggestionSaved.set(saved !== null);
      });
    });

    inject(DestroyRef).onDestroy(() => this.suggestionRequest?.unsubscribe());
  }

  /** el texto de un campo: lo tipeado o el valor guardado, con coma decimal */
  protected field(key: FieldKey): string {
    const typed = this.drafts()[key];
    if (typed !== undefined) return typed;
    const inputs = this.inputs();
    const value =
      key === 'price'
        ? inputs.priceUsdT
        : key === 'yield'
          ? this.yieldTHa()
          : key === 'commercial'
            ? inputs.commercialUsdT
            : inputs.costs[key];
    return value === null ? '' : String(value).replace('.', ',');
  }

  protected onCampaign(value: string): void {
    this.campaignId.set(value === '' ? null : Number(value));
  }

  protected setPrice(raw: string): void {
    this.type('price', raw, { ...this.inputs(), priceUsdT: parse(raw) });
  }

  /**
   * pide el precio sugerido de Rofex y lo carga en el campo; el productor lo puede cambiar. con
   * una sugerencia guardada ("Actualizar"), si falla queda la que había y su precio no cambia
   */
  protected loadSuggestedPrice(): void {
    const label = this.campaignLabel();
    this.suggestionRequest?.unsubscribe();
    this.loadingSuggestion.set(true);
    this.suggestionError.set(null);
    this.suggestionRequest = this.api
      .suggestedPrice('SOY', label === NO_CAMPAIGN ? null : label)
      .subscribe({
        next: (price) => {
          this.loadingSuggestion.set(false);
          this.suggestionSaved.set(false);
          this.suggestion.set(price);
          this.useSuggestion(price);
        },
        error: (err: HttpErrorResponse) => {
          this.loadingSuggestion.set(false);
          const detail = (err.error as { detail?: string } | null)?.detail;
          this.suggestionError.set(
            err.status === 0
              ? 'No connection to the server.'
              : (detail ?? 'Could not get the Rofex price.'),
          );
        },
      });
  }

  /** el precio sugerido pasa al campo (otra vez, si el productor lo había cambiado) */
  protected useSuggestion(price: SuggestedPrice): void {
    this.setPrice(String(price.price_usd_t).replace('.', ','));
  }

  private clearSuggestion(): void {
    this.suggestionRequest?.unsubscribe();
    this.suggestionRequest = null;
    this.loadingSuggestion.set(false);
    this.suggestion.set(null);
    this.suggestionSaved.set(false);
    this.suggestionError.set(null);
  }

  protected suggestionKind(kind: SuggestedPrice['kind']): string {
    return kind === 'settlement' ? 'settlement' : kind === 'last' ? 'last traded' : 'close';
  }

  protected suggestionDate(date: string | null): string {
    if (!date) return '';
    const [y, m, d] = date.split('-');
    return ` on ${d}/${m}/${y}`;
  }

  /** la fecha del dato para la línea a la vista: " · 13/11/2026", o nada si no vino */
  protected suggestionDay(date: string | null): string {
    if (!date) return '';
    const [y, m, d] = date.split('-');
    return ` · ${d}/${m}/${y}`;
  }

  protected setYield(raw: string): void {
    this.type('yield', raw, { ...this.inputs(), yieldTHa: parse(raw) });
  }

  protected setCommercial(raw: string): void {
    this.type('commercial', raw, { ...this.inputs(), commercialUsdT: parse(raw) });
  }

  protected setCost(key: CostKey, raw: string): void {
    const inputs = this.inputs();
    this.type(key, raw, { ...inputs, costs: { ...inputs.costs, [key]: parse(raw) } });
  }

  protected percent(step: number): string {
    return step === 0 ? 'Current' : `${step > 0 ? '+' : ''}${Math.round(step * 100)} %`;
  }

  protected number(value: number | null, digits = 2): string {
    return value === null
      ? 'No data'
      : value.toLocaleString('es-AR', { maximumFractionDigits: digits });
  }

  /** "3,4 t/ha", o "No data" sin la unidad */
  protected tons(value: number | null): string {
    return value === null ? 'No data' : `${this.number(value)} t/ha`;
  }

  private type(key: FieldKey, raw: string, inputs: ProfitInputs): void {
    this.drafts.update((drafts) => ({ ...drafts, [key]: raw }));
    this.inputs.set(inputs);
    const id = this.lotId();
    // con la sugerencia de Rofex, si la hay: el origen del precio se decide comparándolos
    if (Number.isInteger(id)) {
      this.store.save(id, this.campaignLabel(), inputs, this.suggestion());
    }
  }
}

/** campo vacío o inválido: null. acepta coma decimal */
function parse(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** "1.234" en es-AR, sin decimales; null si falta */
function amount(value: number | null): string | null {
  return value === null ? null : value.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}
