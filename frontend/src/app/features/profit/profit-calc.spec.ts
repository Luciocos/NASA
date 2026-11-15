import { computeProfit, emptyProfitInputs, formatUsd, sensitivity } from './profit-calc';

// valores armados para la prueba: no son precios ni costos reales
function inputs() {
  const base = emptyProfitInputs();
  return {
    ...base,
    priceUsdT: 300,
    commercialUsdT: 20,
    costs: { ...base.costs, seed: 100, fertilizer: 150, labor: 120 },
  };
}

describe('profit-calc', () => {
  it('calcula ingreso, comercialización, costos y margen por hectárea y del lote', () => {
    const result = computeProfit(inputs(), 3, 40);
    expect(result.grossUsdHa).toBe(900);
    expect(result.commercialUsdHa).toBe(60);
    expect(result.directUsdHa).toBe(370);
    expect(result.marginUsdHa).toBe(470);
    expect(result.marginTotalUsd).toBe(18_800);
    expect(result.missing).toEqual([]);
    expect(result.missingCosts).toEqual(['pesticide', 'harvest', 'rent', 'other']);
  });

  it('el rinde de indiferencia cubre los costos con el precio neto', () => {
    const result = computeProfit(inputs(), 3, 1);
    expect(result.breakEvenTHa).toBeCloseTo(370 / 280, 6);
  });

  it('sin rinde o sin precio no inventa el margen', () => {
    expect(computeProfit(inputs(), null, 10).marginUsdHa).toBeNull();
    expect(computeProfit(inputs(), null, 10).missing).toEqual(['rinde']);
    const noPrice = { ...inputs(), priceUsdT: null };
    const result = computeProfit(noPrice, 3, 10);
    expect(result.missing).toEqual(['precio']);
    expect(result.breakEvenTHa).toBeNull();
  });

  it('arma la tabla de sensibilidad alrededor del caso base', () => {
    const table = sensitivity(inputs(), 3, [-0.1, 0, 0.1]);
    expect(table).toHaveLength(3);
    expect(table[1].cells[1].marginUsdHa).toBe(470);
    expect(table[2].cells[2].marginUsdHa).toBeGreaterThan(470);
    expect(table[0].cells[0].marginUsdHa).toBeLessThan(470);
  });

  it('un flete sin cargar queda sin dato en el desglose, no como cero', () => {
    const result = computeProfit({ ...emptyProfitInputs(), priceUsdT: 300 }, 3, 10);
    expect(result.commercialUsdHa).toBeNull();
    expect(result.marginUsdHa).toBe(900);
  });

  it('formatea dólares en es-AR', () => {
    expect(formatUsd(18800)).toBe('US$ 18.800');
    expect(formatUsd(null)).toBe('No data');
  });
});
