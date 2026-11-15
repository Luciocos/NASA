/**
 * margen bruto de una campaña, con la regla de los márgenes agrícolas:
 * ingreso bruto (rinde x precio) menos gastos de comercialización (por tonelada) menos costos
 * directos (por hectárea). todo lo económico lo declara el productor: acá no hay precios ni
 * costos de referencia, y un costo vacío no se inventa (queda listado como faltante)
 */

export type CostKey = 'seed' | 'fertilizer' | 'pesticide' | 'labor' | 'harvest' | 'rent' | 'other';

export interface ProfitInputs {
  /** precio del grano en US$ por tonelada */
  priceUsdT: number | null;
  /** flete, comisiones y gastos de comercialización, en US$ por tonelada */
  commercialUsdT: number | null;
  /** costos directos por hectárea, en US$ */
  costs: Record<CostKey, number | null>;
}

export const COST_LABELS: Record<CostKey, string> = {
  seed: 'Semilla',
  fertilizer: 'Fertilizantes',
  pesticide: 'Fitosanitarios',
  labor: 'Labores (siembra y pulverizaciones)',
  harvest: 'Cosecha',
  rent: 'Arrendamiento',
  other: 'Otros costos',
};

export const COST_KEYS = Object.keys(COST_LABELS) as CostKey[];

export function emptyProfitInputs(): ProfitInputs {
  return {
    priceUsdT: null,
    commercialUsdT: null,
    costs: {
      seed: null,
      fertilizer: null,
      pesticide: null,
      labor: null,
      harvest: null,
      rent: null,
      other: null,
    },
  };
}

export interface ProfitResult {
  /** ingreso bruto por hectárea; null sin rinde o sin precio */
  grossUsdHa: number | null;
  commercialUsdHa: number | null;
  /** suma de los costos directos cargados */
  directUsdHa: number;
  marginUsdHa: number | null;
  marginTotalUsd: number | null;
  /** rinde que cubre los costos cargados; null si el precio neto no es positivo */
  breakEvenTHa: number | null;
  /** costos que no se cargaron: el margen puede quedar sobreestimado */
  missingCosts: CostKey[];
  /** lo que falta para calcular el margen */
  missing: ('rinde' | 'precio')[];
}

export function computeProfit(
  inputs: ProfitInputs,
  yieldTHa: number | null,
  areaHa: number,
): ProfitResult {
  const missing: ProfitResult['missing'] = [];
  if (yieldTHa === null) missing.push('rinde');
  if (inputs.priceUsdT === null) missing.push('precio');
  const missingCosts = COST_KEYS.filter((key) => inputs.costs[key] === null);
  const directUsdHa = COST_KEYS.reduce((sum, key) => sum + (inputs.costs[key] ?? 0), 0);
  const commercialT = inputs.commercialUsdT ?? 0;

  const netPrice = inputs.priceUsdT === null ? null : inputs.priceUsdT - commercialT;
  const breakEvenTHa = netPrice !== null && netPrice > 0 ? directUsdHa / netPrice : null;

  if (yieldTHa === null || inputs.priceUsdT === null) {
    return {
      grossUsdHa: null,
      commercialUsdHa: null,
      directUsdHa,
      marginUsdHa: null,
      marginTotalUsd: null,
      breakEvenTHa,
      missingCosts,
      missing,
    };
  }
  const grossUsdHa = yieldTHa * inputs.priceUsdT;
  const commercialUsdHa = yieldTHa * commercialT;
  const marginUsdHa = grossUsdHa - commercialUsdHa - directUsdHa;
  return {
    grossUsdHa,
    commercialUsdHa,
    directUsdHa,
    marginUsdHa,
    marginTotalUsd: marginUsdHa * areaHa,
    breakEvenTHa,
    missingCosts,
    missing,
  };
}

/** margen por hectárea con el precio y el rinde movidos en porcentaje, para la sensibilidad */
export function sensitivity(
  inputs: ProfitInputs,
  yieldTHa: number,
  steps: readonly number[] = [-0.2, -0.1, 0, 0.1, 0.2],
): { yieldStep: number; cells: { priceStep: number; marginUsdHa: number | null }[] }[] {
  return steps.map((yieldStep) => ({
    yieldStep,
    cells: steps.map((priceStep) => {
      const price = inputs.priceUsdT === null ? null : inputs.priceUsdT * (1 + priceStep);
      const result = computeProfit({ ...inputs, priceUsdT: price }, yieldTHa * (1 + yieldStep), 1);
      return { priceStep, marginUsdHa: result.marginUsdHa };
    }),
  }));
}

/** "1.234" con el formato de Argentina y sin decimales; "Sin dato" si falta */
export function formatUsd(value: number | null, digits = 0): string {
  if (value === null) return 'Sin dato';
  return `US$ ${value.toLocaleString('es-AR', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}
