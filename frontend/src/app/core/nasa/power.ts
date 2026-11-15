import { round } from './geo';
import type { NasaHttp } from './http';
import type { ClimateDay, LatLng } from './models';

export const POWER_BASE = 'https://power.larc.nasa.gov/api/temporal/daily/point';
export const POWER_PARAMETERS = ['PRECTOTCORR', 'T2M_MAX', 'T2M_MIN', 'GWETTOP', 'GWETROOT'];

const POWER_FILL = -999;
const DAY_MS = 86_400_000;
/** POWER corrige los últimos días durante unas semanas: recién después la copia no vence */
const SETTLED_MS = 30 * DAY_MS;

export interface PowerResponse {
  properties: { parameter: Record<string, Record<string, number>> };
  parameters?: Record<string, { units: string; longname: string }>;
}

export interface PowerFetched {
  data: ClimateDay[];
  stale: boolean;
  savedAt: string;
}

export interface MonthlyRain {
  /** AAAA-MM */
  month: string;
  /** null si ningún día del mes tiene dato */
  rainMm: number | null;
  days: number;
  missingDays: number;
}

const compact = (iso: string) => iso.slice(0, 10).replaceAll('-', '');
const value = (raw: number | undefined) =>
  raw === undefined || raw <= POWER_FILL || !Number.isFinite(raw) ? null : raw;

/** días de POWER ordenados; -999 pasa a null */
export function parsePowerDaily(body: PowerResponse): ClimateDay[] {
  const p = body.properties?.parameter ?? {};
  const dates = Object.keys(p['PRECTOTCORR'] ?? p['T2M_MAX'] ?? {}).sort();
  return dates.map((d) => ({
    date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
    rainMm: value(p['PRECTOTCORR']?.[d]),
    tMaxC: value(p['T2M_MAX']?.[d]),
    tMinC: value(p['T2M_MIN']?.[d]),
    soilTop: value(p['GWETTOP']?.[d]),
    soilRoot: value(p['GWETROOT']?.[d]),
  }));
}

/** lluvia sumada por mes; los días sin dato se cuentan aparte, no se rellenan */
export function monthlyRain(days: ClimateDay[]): MonthlyRain[] {
  const months = new Map<string, MonthlyRain>();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    const m = months.get(month) ?? { month, rainMm: null, days: 0, missingDays: 0 };
    m.days++;
    if (day.rainMm === null) m.missingDays++;
    else m.rainMm = round((m.rainMm ?? 0) + day.rainMm, 2);
    months.set(month, m);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** lluvia de los últimos n días hasta el último día con dato */
export function lastDaysRain(
  days: ClimateDay[],
  n: number,
): { rainMm: number | null; from: string; to: string; missingDays: number } | null {
  const withData = days.filter((d) => d.rainMm !== null);
  const last = withData.at(-1);
  if (!last) return null;
  const from = new Date(Date.parse(last.date) - (n - 1) * DAY_MS).toISOString().slice(0, 10);
  const window = days.filter((d) => d.date >= from && d.date <= last.date);
  const valid = window.filter((d) => d.rainMm !== null);
  return {
    rainMm: round(
      valid.reduce((s, d) => s + (d.rainMm ?? 0), 0),
      2,
    ),
    from,
    to: last.date,
    missingDays: n - valid.length,
  };
}

/** humedad del suelo del último día que la tiene */
export function latestSoilWetness(
  days: ClimateDay[],
): { date: string; soilTop: number | null; soilRoot: number | null } | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.soilTop !== null || d.soilRoot !== null) {
      return { date: d.date, soilTop: d.soilTop, soilRoot: d.soilRoot };
    }
  }
  return null;
}

/** NASA POWER diario por punto (modelo y reanálisis, grilla de unos 50 km) */
export class PowerClient {
  constructor(
    private readonly http: NasaHttp,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async daily(point: LatLng, startIso: string, endIso: string): Promise<PowerFetched> {
    // 0,01° alcanza: la grilla de POWER es de medio grado y así los lotes vecinos comparten copia
    const [lat, lng] = point.map((v) => round(v, 2));
    const settled = Date.parse(endIso) + SETTLED_MS < this.now();
    const res = await this.http.get<PowerResponse>({
      url:
        `${POWER_BASE}?parameters=${POWER_PARAMETERS.join(',')}&community=AG` +
        `&longitude=${lng}&latitude=${lat}&start=${compact(startIso)}&end=${compact(endIso)}` +
        '&format=JSON',
      service: 'power',
      maxAgeMs: settled ? Infinity : 6 * 3_600_000,
    });
    return { data: parsePowerDaily(res.body), stale: res.stale, savedAt: res.savedAt };
  }
}
