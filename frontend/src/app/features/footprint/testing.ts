import {
  Footprint,
  FootprintComponent,
  LotDetail,
  ScoreCriterion,
  SustainabilityScore,
} from '../../core/models';

// Respuestas armadas para las pruebas: no representan un lote real. Con factores y
// pesos nulos, como devuelve hoy el backend.

/** Ficha de un lote propio, sin campañas. */
export function makeLot(overrides: Partial<LotDetail> = {}): LotDetail {
  return {
    id: 1,
    name: 'Lote de prueba',
    renspa: '',
    locality: 'Casilda',
    province: 'Santa Fe',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-61.2, -33.05],
          [-61.19, -33.05],
          [-61.19, -33.04],
          [-61.2, -33.05],
        ],
      ],
    },
    area_ha: 55,
    created_at: '2026-11-14T10:00:00Z',
    event_count: 0,
    is_example: false,
    owned: true,
    campaigns: [],
    land_use_declaration: null,
    ...overrides,
  };
}

/** Un componente calculado con un factor con fuente (valores armados, no del lote). */
export function makeComponent(overrides: Partial<FootprintComponent> = {}): FootprintComponent {
  return {
    key: 'seed',
    label: 'Semilla',
    status: 'calculado',
    reason: null,
    note: null,
    activity: {
      quantity: 34,
      unit: 'kg/ha',
      origin: 'ESTIMATED',
      origins: ['ESTIMATED'],
      records: 1,
      reference: 'Tabla de referencia de prueba',
    },
    factor: {
      key: 'seed_corn',
      value: 1.772,
      unit: 'kg CO2e/kg',
      source: 'Fuente de prueba, tabla 1',
      validated: true,
    },
    kg_co2e_per_ha: 60.2,
    kg_co2e_per_t: 7.5,
    is_simulated: false,
    hypothetical: false,
    ...overrides,
  };
}

export function makeFootprint(overrides: Partial<Footprint> = {}): Footprint {
  return {
    lot: 1,
    campaign: { id: 10, label: '2025/26', crop: 'SOY', crop_origin: 'DECLARED' },
    available_campaigns: [
      { id: 9, label: '2024/25' },
      { id: 10, label: '2025/26' },
    ],
    provisional: true,
    disclaimer: 'Estimación con respaldo satelital. Prueba de concepto.',
    unit: 'kg CO2e/t',
    complete: false,
    total_kg_co2e_per_t: null,
    message: 'No se puede calcular todavía: faltan 1 de 1 componentes y falta el rendimiento.',
    missing_components: ['diesel'],
    yield: {
      value: null,
      unit: 't/ha',
      origin: null,
      status: 'sin_dato',
      reason: 'Falta el rendimiento de la campaña 2025/26.',
    },
    components: [
      {
        key: 'diesel',
        label: 'Gasoil de labores',
        status: 'sin_dato',
        reason: 'Falta el factor de emisión (sin valor con fuente en factors.yaml).',
        note: null,
        activity: { quantity: null, unit: null, origin: null, origins: [], records: 0 },
        factor: { key: 'diesel', value: null, unit: null, source: null, validated: false },
        kg_co2e_per_ha: null,
        kg_co2e_per_t: null,
        is_simulated: false,
        hypothetical: false,
      },
    ],
    confidence: {
      level: 'BAJO',
      counts: { VERIFIED: 0, DECLARED: 0, ESTIMATED: 1 },
      total: 1,
      rule: 'ALTO si la mayoría de los datos del lote son verificados o declarados.',
    },
    uses_simulated_data: true,
    ...overrides,
  };
}

export function makeCriterion(overrides: Partial<ScoreCriterion> = {}): ScoreCriterion {
  return {
    key: 'winter_cover',
    label: 'Cobertura invernal (cultivo de cobertura)',
    status: 'no_cumple',
    status_label: 'No cumple',
    origin: 'ESTIMATED',
    reason: 'No hay eventos de cultivo de cobertura en la bitácora.',
    evidence: [],
    is_simulated: false,
    hypothetical: false,
    weight: null,
    ...overrides,
  };
}

export function makeScore(overrides: Partial<SustainabilityScore> = {}): SustainabilityScore {
  return {
    lot: 1,
    provisional: true,
    disclaimer: 'Estimación con respaldo satelital. Prueba de concepto.',
    score: null,
    max_score: 100,
    weights_defined: false,
    message: 'Puntaje numérico no disponible: pesos pendientes de definir por el equipo.',
    criteria: [makeCriterion()],
    missing_criteria: [],
    confidence: {
      level: 'BAJO',
      counts: { VERIFIED: 0, DECLARED: 0, ESTIMATED: 1 },
      total: 1,
      rule: '',
    },
    uses_simulated_data: false,
    ...overrides,
  };
}
