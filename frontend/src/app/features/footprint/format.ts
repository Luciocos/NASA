import { ConfidenceLevel, CriterionStatus, Footprint, FootprintComponent } from '../../core/models';
import { IconName } from '../../shared/ui/icon/icons';

/** Texto fijo de la pantalla. Nunca usar las palabras "certificado" ni "certificación". */
export const ESTIMATE_NOTICE = 'Estimación con respaldo satelital. Prueba de concepto.';

/** Estado de un criterio con símbolo y texto: el significado no depende solo del color. */
export const CRITERION_STATUS: Record<CriterionStatus, { icon: string; label: string }> = {
  cumple: { icon: '✓', label: 'Cumple' },
  no_cumple: { icon: '✗', label: 'No cumple' },
  sin_dato: { icon: '?', label: 'Sin dato' },
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  ALTO: 'Alto',
  BAJO: 'Bajo',
  'SIN DATOS': 'Sin datos',
};

/** El nivel de confianza en un chip: el texto y el ícono dicen lo mismo que el color. */
export const CONFIDENCE_CHIP: Record<
  ConfidenceLevel,
  { text: string; tone: 'ok' | 'warn' | 'plain'; icon: IconName }
> = {
  ALTO: { text: 'Confianza alta', tone: 'ok', icon: 'check' },
  BAJO: { text: 'Confianza baja', tone: 'warn', icon: 'alert' },
  'SIN DATOS': { text: 'Sin datos del lote', tone: 'plain', icon: 'info' },
};

export function formatNumber(value: number | null, digits = 1): string {
  return value === null
    ? 'Sin dato'
    : value.toLocaleString('es-AR', { maximumFractionDigits: digits });
}

export function formatKgPerTonne(value: number | null): string {
  return value === null ? 'Sin dato' : `${formatNumber(value)} kg CO2e/t`;
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
  fertilizer_n_production: 'Fertilizante nitrogenado',
  fertilizer_p_production: 'Fertilizante fosforado',
  soil_n2o: 'N2O del suelo',
  diesel: 'Gasoil',
  pesticides: 'Fitosanitarios',
  seed: 'Semilla',
  land_use_change: 'Cambio de uso del suelo',
};

/** El insumo que tiene que cargar el productor para cada componente. */
const INPUT_NAMES: Record<string, string> = {
  fertilizer_n_production: 'nitrógeno',
  soil_n2o: 'nitrógeno',
  fertilizer_p_production: 'fósforo',
  diesel: 'gasoil',
  pesticides: 'fitosanitarios',
  seed: 'semilla',
};

export function shortLabel(component: FootprintComponent): string {
  return SHORT_LABELS[component.key] ?? component.label;
}

/** "a, b y c" en castellano. */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export type MissingKind = 'yield' | 'inputs' | 'factors' | 'landUse' | 'other';

/** Un renglón de "Para calcularla falta", en lenguaje llano. */
export interface MissingItem {
  kind: MissingKind;
  /** el texto del chip, de una o dos palabras: "Insumos", "Factor de emisión" */
  chip: string;
  /** "Insumos" */
  title: string;
  /** "nitrógeno, fósforo y gasoil" */
  detail: string;
  /** quién lo completa: "lo cargás vos" */
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
      chip: 'Rinde',
      title: 'Rinde',
      detail: fp.campaign ? `de la campaña ${fp.campaign.label}` : 'de la campaña',
      who: own ? 'lo cargás vos' : 'lo carga el productor',
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
      chip: 'Insumos',
      title: 'Insumos',
      detail: joinList([...inputs]),
      who: own ? 'los cargás vos' : 'los carga el productor',
    });
  }
  if (factors.size > 0) {
    items.push({
      kind: 'factors',
      chip: 'Factor de emisión',
      title: 'Factor de emisión con fuente',
      detail: joinList([...factors]),
      who: 'lo carga el equipo',
    });
  }
  if (landUse) {
    // la huella usa el evento de la bitácora o, si no lo hay, la declaración del productor; lo
    // que vio MODIS es orientativo y no entra en la cuenta
    items.push({
      kind: 'landUse',
      chip: 'Uso del suelo',
      title: 'Uso del suelo',
      detail: 'desde 2020',
      who: own
        ? 'declaralo en la pestaña Prácticas (lo que vio MODIS es orientativo y no entra en la cuenta)'
        : 'lo declara el productor o lo registra la bitácora (lo que vio MODIS es orientativo y no entra en la cuenta)',
    });
  }
  if (other.size > 0) {
    items.push({
      kind: 'other',
      chip: 'Datos a revisar',
      title: 'Datos a revisar',
      detail: joinList([...other]),
      who: 'mirá el motivo en Desglose',
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
  if (c.key === 'land_use_change' && c.activity.detected === null)
    return 'Sin declaración ni evento';
  const noRecords = c.activity.records === 0 && c.activity.quantity === null;
  const noFactor = c.factor.value === null || c.factor.value === undefined;
  if (noRecords && noFactor) return 'Faltan el dato y el factor';
  if (noRecords) return `Falta cargar ${INPUT_NAMES[c.key] ?? 'el dato'}`;
  if (noFactor) return 'Falta el factor de emisión';
  return 'Dato incompleto';
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
  if (status === 0) return `No hay conexión: revisá tu internet y probá de nuevo para ver ${what}.`;
  return `No pudimos mostrar ${what} en este momento. Probá de nuevo en un rato.`;
}
