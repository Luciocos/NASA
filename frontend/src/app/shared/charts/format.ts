/** texto de un valor que no existe. las gráficas nunca rellenan ni interpolan un faltante */
export const NO_DATA = 'No data';

const LOCALE = 'en-US';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function isMissing(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || !Number.isFinite(value);
}

// redondea antes de formatear para que un -0,04 con un decimal no salga como "-0,0"
function roundTo(value: number, decimals: number): number {
  const rounded = Number(value.toFixed(decimals));
  return rounded === 0 ? 0 : rounded;
}

// toFixed y toLocaleString aceptan hasta 20 decimales
function clampDecimals(decimals: number): number {
  return Number.isFinite(decimals) ? Math.min(20, Math.max(0, Math.floor(decimals))) : 0;
}

/**
 * número en formato es-AR con una cantidad fija de decimales: 1250.5 -> "1.250,5".
 * null, undefined, NaN e infinito devuelven "Sin dato"
 */
export function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (isMissing(value)) {
    return NO_DATA;
  }
  const digits = clampDecimals(decimals);
  return roundTo(value, digits).toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** igual que formatNumber pero con el signo siempre a la vista: "+350", "-120", "0" */
export function formatSigned(value: number | null | undefined, decimals = 0): string {
  if (isMissing(value)) {
    return NO_DATA;
  }
  const digits = clampDecimals(decimals);
  return roundTo(value, digits).toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'exceptZero',
  });
}

/** número con su unidad: (1.03, "dB", 2) -> "1,03 dB". sin valor devuelve "Sin dato" */
export function formatValue(value: number | null | undefined, unit = '', decimals = 1): string {
  if (isMissing(value)) {
    return NO_DATA;
  }
  return withUnit(formatNumber(value, decimals), unit);
}

/** agrega la unidad a un número ya formateado, si hay unidad */
export function withUnit(text: string, unit = ''): string {
  return unit ? `${text} ${unit}` : text;
}

/** proporción entre 0 y 1 como porcentaje: 0.625 -> "63 %" */
export function formatPercent(ratio: number | null | undefined, decimals = 0): string {
  if (isMissing(ratio)) {
    return NO_DATA;
  }
  return `${formatNumber(ratio * 100, decimals)} %`;
}

/**
 * "2026-09-07" -> "07/09/2026". trabaja sobre el texto, sin pasar por Date, para que la
 * zona horaria no corra el día. sin fecha devuelve "Sin dato"; un texto que no es una
 * fecha AAAA-MM-DD se devuelve tal cual
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return NO_DATA;
  }
  const match = ISO_DATE.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** "2026-09-07" -> "sep 26": mes corto y año de dos cifras */
export function formatMonthShort(iso: string | null | undefined): string {
  if (!iso) {
    return NO_DATA;
  }
  const match = ISO_DATE.exec(iso);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1].slice(2)}` : iso;
}

/** incertidumbre de una fecha: 6 -> "± 6 días", 1 -> "± 1 día". sin dato devuelve "" */
export function formatUncertainty(days: number | null | undefined): string {
  if (isMissing(days) || days <= 0) {
    return '';
  }
  return `± ${formatNumber(days, 0)} ${days === 1 ? 'day' : 'days'}`;
}

/** fecha con su incertidumbre: "07/09/2026 ± 6 días" (o solo la fecha si no hay incertidumbre) */
export function formatDateWithUncertainty(
  iso: string | null | undefined,
  days: number | null | undefined,
): string {
  const uncertainty = formatUncertainty(days);
  return uncertainty ? `${formatDate(iso)} ${uncertainty}` : formatDate(iso);
}
