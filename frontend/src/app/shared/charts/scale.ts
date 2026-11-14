import { formatMonthShort } from './format';

const DAY_MS = 86_400_000;

/** escala lineal: lleva un valor del dominio a una posición del rango */
export interface LinearScale {
  (value: number): number;
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  /** posición del rango de vuelta al dominio */
  invert(position: number): number;
}

/**
 * crea una escala lineal. con un dominio degenerado (mínimo igual al máximo) todo valor
 * cae en el centro del rango, en vez de dividir por cero
 *
 * @param clamp si es true, los valores fuera del dominio se pegan al borde del rango
 */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
  clamp = false,
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const degenerate = span === 0 || !Number.isFinite(span);

  const scale = (value: number): number => {
    if (degenerate) {
      return (r0 + r1) / 2;
    }
    const t = (value - d0) / span;
    return r0 + (clamp ? Math.min(1, Math.max(0, t)) : t) * (r1 - r0);
  };
  const invert = (position: number): number =>
    degenerate || r1 === r0 ? d0 : d0 + ((position - r0) / (r1 - r0)) * span;

  return Object.assign(scale, { domain, range, invert });
}

/**
 * paso "redondo" para cubrir un tramo con cerca de `targetCount` marcas:
 * siempre 1, 2 o 5 por una potencia de 10
 */
export function niceStep(span: number, targetCount = 5): number {
  const size = Math.abs(span);
  if (!Number.isFinite(size) || size === 0) {
    return 1;
  }
  const raw = size / Math.max(1, targetCount);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return factor * magnitude;
}

/** decimales que hacen falta para escribir sin ruido los múltiplos de un paso */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return 0;
  }
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/** marcas de un eje numérico */
export interface NiceTicks {
  /** valores de las marcas, de menor a mayor */
  values: number[];
  step: number;
  /** decimales para rotular las marcas */
  decimals: number;
  /** dominio ampliado hasta la primera y la última marca */
  domain: [number, number];
}

/**
 * marcas "redondas" que cubren [min, max]. el dominio se amplía hasta el múltiplo del paso
 * más cercano hacia afuera. si min y max coinciden se abre un tramo alrededor del valor
 * (o [0, 1] si el valor es cero) para que la escala no quede degenerada
 */
export function niceTicks(min: number, max: number, targetCount = 5): NiceTicks {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 1;
  if (lo > hi) {
    [lo, hi] = [hi, lo];
  }
  if (lo === hi) {
    if (lo === 0) {
      hi = 1;
    } else {
      const pad = Math.abs(lo) / 2;
      lo -= pad;
      hi += pad;
    }
  }
  const step = niceStep(hi - lo, targetCount);
  const decimals = stepDecimals(step);
  // el épsilon evita que 0.30000000000000004 / 0.1 sume una marca de más
  const first = Math.floor(lo / step + 1e-9);
  const last = Math.ceil(hi / step - 1e-9);
  const values: number[] = [];
  for (let i = first; i <= last; i++) {
    const value = Number((i * step).toFixed(decimals));
    values.push(value === 0 ? 0 : value);
  }
  return { values, step, decimals, domain: [values[0], values[values.length - 1]] };
}

/**
 * días transcurridos desde 1970-01-01 para una fecha AAAA-MM-DD. todo el cálculo es en UTC,
 * así la zona horaria nunca corre el día. devuelve NaN si la fecha no existe
 */
export function isoToDay(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!match) {
    return NaN;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  // Date.UTC acomoda fechas imposibles (30 de febrero pasa a marzo): se descartan
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return NaN;
  }
  return Math.round(time / DAY_MS);
}

/** fecha AAAA-MM-DD de un número de día (inversa de isoToDay) */
export function dayToIso(day: number): string {
  return new Date(Math.round(day) * DAY_MS).toISOString().slice(0, 10);
}

/** suma (o resta) días a una fecha AAAA-MM-DD */
export function addDays(iso: string, days: number): string {
  return dayToIso(isoToDay(iso) + days);
}

/** escala de tiempo: lleva una fecha AAAA-MM-DD a una posición del rango */
export interface TimeScale {
  (iso: string): number;
  readonly domain: readonly [string, string];
  readonly range: readonly [number, number];
  /** igual que llamar a la escala, pero con un número de día de isoToDay */
  day(day: number): number;
}

/** crea una escala de tiempo entre dos fechas AAAA-MM-DD. un solo día cae en el centro */
export function timeScale(
  domain: readonly [string, string],
  range: readonly [number, number],
): TimeScale {
  const linear = linearScale([isoToDay(domain[0]), isoToDay(domain[1])], range);
  const scale = (iso: string): number => linear(isoToDay(iso));
  return Object.assign(scale, { domain, range, day: (day: number) => linear(day) });
}

export type TimeUnit = 'month' | 'quarter' | 'year';

export interface TimeTick {
  /** primer día del mes, trimestre o año: AAAA-MM-01 */
  date: string;
  /** "sep 26" para meses y trimestres, "2026" para años */
  label: string;
  /** true si la marca abre un año */
  major: boolean;
}

export interface TimeTicks {
  unit: TimeUnit;
  /** cada cuántas unidades hay una marca (solo supera 1 con años) */
  step: number;
  ticks: TimeTick[];
}

/**
 * marcas de un eje de tiempo entre dos fechas AAAA-MM-DD: por mes, por trimestre o por año
 * (y cada 2, 5, 10... años si hace falta), con la unidad más fina que no pase de `maxTicks`.
 * las marcas caen en el primer día de cada período, alineadas al calendario. en un tramo
 * que no contiene ningún primero de mes la lista queda vacía
 */
export function timeTicks(start: string, end: string, maxTicks = 8): TimeTicks {
  const startDay = isoToDay(start);
  const endDay = isoToDay(end);
  if (Number.isNaN(startDay) || Number.isNaN(endDay) || endDay < startDay) {
    return { unit: 'month', step: 1, ticks: [] };
  }
  const limit = Math.max(1, Math.floor(maxTicks));
  // los meses se cuentan como un índice continuo: año * 12 + mes
  const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  const first = monthIndex(start) + (start.slice(8, 10) === '01' ? 0 : 1);
  const last = monthIndex(end);

  const collect = (months: number): number[] => {
    const indexes: number[] = [];
    for (let index = Math.ceil(first / months) * months; index <= last; index += months) {
      indexes.push(index);
    }
    return indexes;
  };

  let months = 1;
  let indexes = collect(months);
  for (const candidate of [3, 12]) {
    if (indexes.length <= limit) {
      break;
    }
    months = candidate;
    indexes = collect(months);
  }
  // más allá del año se sigue con pasos redondos: 2, 5, 10, 20... años
  for (let exponent = 0; indexes.length > limit; exponent++) {
    for (const factor of [2, 5, 10]) {
      months = 12 * factor * 10 ** exponent;
      indexes = collect(months);
      if (indexes.length <= limit) {
        break;
      }
    }
  }

  const ticks = indexes.map((index): TimeTick => {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
    return {
      date,
      label: months >= 12 ? String(year) : formatMonthShort(date),
      major: month === 1,
    };
  });
  return {
    unit: months === 1 ? 'month' : months === 3 ? 'quarter' : 'year',
    step: months >= 12 ? months / 12 : 1,
    ticks,
  };
}
