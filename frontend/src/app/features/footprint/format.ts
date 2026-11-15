import {
  ConfidenceLevel,
  CriterionStatus,
  Footprint,
  FootprintComponent,
  ScoreCriterion,
} from '../../core/models';
import { IconName } from '../../shared/ui/icon/icons';

/** Texto fijo de la pantalla. Nunca usar las palabras "certificado" ni "certificación" ("certified"). */
export const ESTIMATE_NOTICE = 'Satellite-backed estimate. Proof of concept.';

/** Estado de un criterio con símbolo y texto: el significado no depende solo del color. */
export const CRITERION_STATUS: Record<CriterionStatus, { icon: string; label: string }> = {
  cumple: { icon: '✓', label: 'Met' },
  no_cumple: { icon: '✗', label: 'Not met' },
  sin_dato: { icon: '?', label: 'No data' },
};

/**
 * nombre de cada criterio del puntaje por su clave (backend/carbon/score.py, CRITERIA), en el
 * idioma de la pantalla. un criterio nuevo que no esté acá usa el rótulo que manda el backend
 */
const CRITERION_LABELS: Record<string, string> = {
  no_land_use_change_since_2020: 'No land-use change since 2020',
  no_till: 'No-till (no soil disturbance)',
  winter_cover: 'Winter cover (cover crop)',
  rotation: 'Crop rotation between seasons',
  no_burn: 'No burning',
};

export function criterionLabel(criterion: Pick<ScoreCriterion, 'key' | 'label'>): string {
  return CRITERION_LABELS[criterion.key] ?? criterion.label;
}

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  ALTO: 'High',
  BAJO: 'Low',
  'SIN DATOS': 'No data',
};

/** El nivel de confianza en un chip: el texto y el ícono dicen lo mismo que el color. */
export const CONFIDENCE_CHIP: Record<
  ConfidenceLevel,
  { text: string; tone: 'ok' | 'warn' | 'plain'; icon: IconName }
> = {
  ALTO: { text: 'High confidence', tone: 'ok', icon: 'check' },
  BAJO: { text: 'Low confidence', tone: 'warn', icon: 'alert' },
  'SIN DATOS': { text: 'No data for this field', tone: 'plain', icon: 'info' },
};

export function formatNumber(value: number | null, digits = 1): string {
  return value === null
    ? 'No data'
    : value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function formatKgPerTonne(value: number | null): string {
  return value === null ? 'No data' : `${formatNumber(value)} kg CO2e/t`;
}

/** "2026-11-14T10:00:00-03:00" -> "14/11/2026 10:00", en hora de Argentina. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// Lo que sigue es solo presentación: ordena y nombra lo que ya manda el backend, sin
// recalcular nada.

/** Nombre corto de cada componente, para listas y gráficas angostas. */
const SHORT_LABELS: Record<string, string> = {
  fertilizer_n_production: 'Nitrogen fertilizer',
  fertilizer_p_production: 'Phosphate fertilizer',
  soil_n2o: 'Soil N2O',
  diesel: 'Diesel',
  pesticides: 'Pesticides',
  seed: 'Seed',
  land_use_change: 'Land-use change',
};

/** El insumo que tiene que cargar el productor para cada componente. */
const INPUT_NAMES: Record<string, string> = {
  fertilizer_n_production: 'nitrogen',
  soil_n2o: 'nitrogen',
  fertilizer_p_production: 'phosphorus',
  diesel: 'diesel',
  pesticides: 'pesticides',
  seed: 'seed',
};

export function shortLabel(component: FootprintComponent): string {
  return SHORT_LABELS[component.key] ?? component.label;
}

/** "a, b and c" */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export type MissingKind = 'yield' | 'inputs' | 'factors' | 'landUse' | 'other';

/** Un renglón de "Para calcularla falta", en lenguaje llano. */
export interface MissingItem {
  kind: MissingKind;
  /** el texto del chip, de una o dos palabras: "Inputs", "Emission factor" */
  chip: string;
  /** "Inputs" */
  title: string;
  /** "nitrogen, phosphorus and diesel" */
  detail: string;
  /** quién lo completa: "you enter it" */
  who: string;
}

/**
 * Lo que falta para calcular la huella, agrupado: el rinde y los insumos los carga el
 * productor; los factores de emisión con fuente, el equipo; si hubo cambio de uso del suelo
 * desde 2020 sale de la bitácora satelital o, si no tiene ese evento, de lo que declara el
 * productor en Prácticas (backend/carbon/footprint.py). Un componente puede faltar por más de un
 * motivo. En un lote ajeno (un ejemplo) el rinde, los insumos y la declaración los carga el
 * productor, no quien mira.
 */
export function missingItems(fp: Footprint, own = true): MissingItem[] {
  const items: MissingItem[] = [];
  if (fp.yield.value === null) {
    items.push({
      kind: 'yield',
      chip: 'Yield',
      title: 'Yield',
      detail: fp.campaign ? `for the ${fp.campaign.label} season` : 'for the season',
      who: own ? 'you enter it' : 'the farmer enters it',
    });
  }
  const inputs = new Set<string>();
  const factors = new Set<string>();
  let landUse = false;
  const other = new Set<string>();
  for (const c of fp.components) {
    if (c.status !== 'sin_dato') continue;
    // sin evento de cambio de uso en la bitácora y sin declaración: no se sabe si hubo cambio
    if (c.key === 'land_use_change' && c.activity.detected === null) {
      landUse = true;
      continue;
    }
    const noRecords = c.activity.records === 0 && c.activity.quantity === null;
    const noFactor = c.factor.value === null || c.factor.value === undefined;
    if (noRecords) inputs.add(INPUT_NAMES[c.key] ?? shortLabel(c).toLowerCase());
    if (noFactor) factors.add(shortLabel(c).toLowerCase());
    if (!noRecords && !noFactor) other.add(shortLabel(c).toLowerCase());
  }
  if (inputs.size > 0) {
    items.push({
      kind: 'inputs',
      chip: 'Inputs',
      title: 'Inputs',
      detail: joinList([...inputs]),
      who: own ? 'you enter them' : 'the farmer enters them',
    });
  }
  if (factors.size > 0) {
    items.push({
      kind: 'factors',
      chip: 'Emission factor',
      title: 'Emission factor with a source',
      detail: joinList([...factors]),
      who: 'the team adds it',
    });
  }
  if (landUse) {
    // la huella usa el evento de la bitácora o, si no lo hay, la declaración del productor; lo
    // que vio MODIS es orientativo y no entra en la cuenta
    items.push({
      kind: 'landUse',
      chip: 'Land use',
      title: 'Land use',
      detail: 'since 2020',
      who: own
        ? 'declare it in the Practices tab (what MODIS saw is indicative and is not counted)'
        : 'the farmer declares it or the field log records it (what MODIS saw is indicative and is not counted)',
    });
  }
  if (other.size > 0) {
    items.push({
      kind: 'other',
      chip: 'Data to review',
      title: 'Data to review',
      detail: joinList([...other]),
      who: 'see the reason in Breakdown',
    });
  }
  return items;
}

/**
 * Motivo corto de un componente sin dato, para que la fila del desglose entre en una línea. El
 * motivo completo del backend se lee al abrir la fila. Usa los mismos criterios que
 * `missingItems`: no recalcula nada.
 */
export function shortReason(c: FootprintComponent): string | null {
  if (c.status !== 'sin_dato') return null;
  if (c.key === 'land_use_change' && c.activity.detected === null) return 'No declaration or event';
  const noRecords = c.activity.records === 0 && c.activity.quantity === null;
  const noFactor = c.factor.value === null || c.factor.value === undefined;
  if (noRecords && noFactor) return 'Missing data and factor';
  if (noRecords) return `Missing ${INPUT_NAMES[c.key] ?? 'activity'} data`;
  if (noFactor) return 'Missing emission factor';
  return 'Incomplete data';
}

/** "No se puede calcular todavía: faltan 4 de 7 componentes." -> "Faltan 4 de 7 componentes." */
export function missingSentence(message: string | null): string | null {
  if (!message) return null;
  const text = message.replace(/^No se puede calcular todavía:\s*/i, '').trim();
  return text ? text[0].toUpperCase() + text.slice(1) : null;
}

/**
 * Error de un pedido en lenguaje llano: sin conexión, servidor caído o algo más. Nunca habla
 * del backend ni de códigos.
 */
export function plainError(status: number | undefined, what: string): string {
  if (status === 0) return `No connection: check your internet and try again to see ${what}.`;
  return `We could not show ${what} right now. Please try again in a moment.`;
}
