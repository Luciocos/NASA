import {
  LAND_USE_GROUP_LABELS,
  type LandUseEvidence,
  type LandUseGroup,
  type LandUseYear,
  type LoadState,
} from '../../../../core/nasa';
import type { IconName } from '../../../../shared/ui/icon/icons';

/** clave del criterio del puntaje que esta tarjeta explica (backend/carbon/score.py) */
export const LAND_USE_KEY = 'no_land_use_change_since_2020';

/** lado del píxel de MCD12Q1 (463,31 m) redondeado, para mientras no llega el dato */
const NOMINAL_PIXEL_M = 460;

/**
 * lo que hay de MODIS: el veredicto, o que todavía no llegó, o que no se pudo pedir. un
 * posible cambio sin un uso dominante en el año base (un empate) es 'unclear': MODIS no vio
 * otro uso, solo no alcanza para decir cuál había. un cambio en parte del lote (el dominante
 * sigue igual) es un posible cambio como cualquier otro
 */
export type ModisStatus = 'loading' | 'error' | 'unclear' | LandUseEvidence['verdict'];

/**
 * lo declarado frente a lo que vio MODIS. match: declaró sin cambio y MODIS vio el mismo uso.
 * mismatch: declaró sin cambio y MODIS vio otro uso algún año. unconfirmed: declaró sin cambio
 * y MODIS no tiene un uso claro en el año base. declared_change: declaró un cambio. no_modis:
 * no hay dato de MODIS para comparar. pending: MODIS todavía no respondió
 */
export type LandUseMatch =
  'pending' | 'match' | 'mismatch' | 'unconfirmed' | 'declared_change' | 'no_modis';

export type Tone = 'ok' | 'warn' | 'info' | 'neutral';

/** una línea a la vista (title, pocas palabras) y su porqué para la ayuda (detail, o '') */
export interface Line {
  tone: Tone;
  icon: IconName;
  title: string;
  detail: string;
}

/** ícono de cada grupo de uso: siempre va con su texto, nunca solo el color o el dibujo */
export const GROUP_ICONS: Record<LandUseGroup, IconName> = {
  agricultural: 'grid',
  natural: 'leaf',
  urban: 'map',
  other: 'cloud',
};

/** el grupo en una o dos palabras, para que entre en la franja de cada año */
const GROUP_SHORT: Record<LandUseGroup, string> = {
  agricultural: 'Cropland',
  natural: 'Natural',
  urban: 'Urban',
  other: 'No vegetation',
};

const GROUP_NOUNS: Record<LandUseGroup, string> = {
  agricultural: 'agricultural use',
  natural: 'natural vegetation',
  urban: 'urban area',
  other: 'water, snow or bare soil',
};

/** "a", "a and b", "a, b and c" */
export function joinList(items: readonly (string | number)[]): string {
  const texts = items.map(String);
  return texts.length < 2
    ? (texts[0] ?? '')
    : `${texts.slice(0, -1).join(', ')} and ${texts[texts.length - 1]}`;
}

/** el estado de la consulta a MODIS, reducido a lo que importa para comparar */
export function modisStatus(state: LoadState<LandUseEvidence>): ModisStatus {
  const evidence = state.data;
  if (evidence) {
    const unclear =
      evidence.verdict === 'possible_change' &&
      !differentYears(evidence).length &&
      !partialChange(evidence);
    return unclear ? 'unclear' : evidence.verdict;
  }
  return state.status === 'error' ? 'error' : 'loading';
}

/** sin declaración no hay nada que comparar */
export function landUseMatch(
  declaredUnchanged: boolean | null | undefined,
  modis: ModisStatus,
): LandUseMatch | null {
  if (declaredUnchanged === null || declaredUnchanged === undefined) return null;
  if (!declaredUnchanged) return 'declared_change';
  if (modis === 'loading') return 'pending';
  if (modis === 'unchanged') return 'match';
  if (modis === 'possible_change') return 'mismatch';
  if (modis === 'unclear') return 'unconfirmed';
  return 'no_modis';
}

/** lado del píxel redondeado a decenas (463,31 m → 460); sin dato, el nominal */
export function pixelSize(evidence: LandUseEvidence | null | undefined): number {
  return evidence ? Math.round(evidence.pixelSizeM / 10) * 10 : NOMINAL_PIXEL_M;
}

/** del año base al último año con dato, también los del medio que vinieron sin dato */
export function visibleYears(evidence: LandUseEvidence): LandUseYear[] {
  const last = evidence.lastYear;
  if (last === null) return [];
  return evidence.years.filter((y) => y.year >= evidence.baselineYear && y.year <= last);
}

function baseYear(evidence: LandUseEvidence): LandUseYear | undefined {
  return evidence.years.find((y) => y.year === evidence.baselineYear && y.pixels > 0);
}

/**
 * años con dato en los que el uso dominante no es el del año base (un empate también cuenta,
 * igual que en el veredicto). vacío si el año base no tiene un uso dominante
 */
export function differentYears(evidence: LandUseEvidence): number[] {
  const base = baseYear(evidence);
  if (!base || base.group === null) return [];
  return evidence.years
    .filter((y) => y.year > evidence.baselineYear && y.pixels > 0 && y.group !== base.group)
    .map((y) => y.year);
}

/**
 * un posible cambio en parte del lote: el año base tiene un uso dominante y ningún año lo
 * cambia, pero una parte de los píxeles vio otro uso (core/nasa, LAND_USE_CHANGED_SHARE). no
 * es un empate: MODIS sí vio un uso distinto, solo que no en la mayor parte del lote
 */
export function partialChange(evidence: LandUseEvidence): boolean {
  const base = baseYear(evidence);
  return (
    evidence.verdict === 'possible_change' &&
    !!base &&
    base.group !== null &&
    differentYears(evidence).length === 0
  );
}

/** "in 2022 and 2023", "in part of the field" o '' (un empate en el año base): dónde vio otro uso */
function changeWhere(evidence: LandUseEvidence): string {
  const years = differentYears(evidence);
  if (years.length) return `in ${joinList(years)}`;
  return partialChange(evidence) ? 'in part of the field' : '';
}

/** el grupo de un año en una o dos palabras: "Cropland", "Mixed" (empate), "No data" */
export function yearLabel(year: LandUseYear): string {
  if (!year.pixels) return 'No data';
  return year.group === null ? 'Mixed' : GROUP_SHORT[year.group];
}

export function yearIcon(year: LandUseYear): IconName {
  if (!year.pixels) return 'minus';
  return year.group === null ? 'layers' : GROUP_ICONS[year.group];
}

/**
 * lo que vio MODIS un año, para la ayuda: grupo, clase IGBP, píxeles con dato y parte
 * agrícola. con un empate no se nombra una clase, porque ninguna domina
 */
function yearText(year: LandUseYear): string {
  if (!year.pixels) return 'no data.';
  const pixels = `${year.pixels} ${year.pixels === 1 ? 'pixel' : 'pixels'} with data`;
  const share =
    year.agriculturalShare === null
      ? ''
      : `, ${Math.round(year.agriculturalShare * 100)} % agricultural use`;
  if (year.group === null) return `no dominant use (tie between uses); ${pixels}${share}.`;
  const igbp =
    year.classId !== null && year.classLabel
      ? `, IGBP class ${year.classId} (${year.classLabel})`
      : '';
  return `${LAND_USE_GROUP_LABELS[year.group]}${igbp}; ${pixels}${share}.`;
}

/** el detalle año por año para la ayuda; los años seguidos con lo mismo van en una línea */
export function yearDetails(years: readonly LandUseYear[]): string[] {
  const runs: { from: number; to: number; text: string }[] = [];
  for (const year of years) {
    const text = yearText(year);
    const last = runs[runs.length - 1];
    if (last && last.text === text && last.to === year.year - 1) last.to = year.year;
    else runs.push({ from: year.year, to: year.year, text });
  }
  return runs.map(
    (run) => `${run.from === run.to ? run.from : `${run.from} to ${run.to}`}: ${run.text}`,
  );
}

/** cuántos píxeles cubren el lote, para la ayuda */
export function pixelText(evidence: LandUseEvidence, mine: boolean): string {
  if (!evidence.pixelCount) return '';
  const size = pixelSize(evidence);
  const lot = mine ? 'your field' : 'this field';
  const count = evidence.pixelCount;
  return evidence.centroidFallback
    ? `No pixel of about ${size} m has its center inside ${lot}: the one that contains its center was used.`
    : `${count} ${count === 1 ? 'pixel' : 'pixels'} of about ${size} m ${count === 1 ? 'covers' : 'cover'} ${lot}.`;
}

/**
 * los textos de core/nasa hablan de "tu lote" ("your field"): en un lote ajeno (un ejemplo) se
 * dice "este lote" ("this field")
 */
export function forLot(text: string, mine: boolean): string {
  return mine
    ? text
    : text
        .replace(/\btu lote\b/g, 'este lote')
        .replace(/\bTu lote\b/g, 'Este lote')
        .replace(/\byour field\b/g, 'this field')
        .replace(/\bYour field\b/g, 'This field');
}

/** el motivo de "Sin dato" en pocas palabras; el completo (evidence.reason) va en la ayuda */
export function noDataShort(evidence: LandUseEvidence): string {
  if (!evidence.pixelCount) return 'No pixels over the field';
  if (!evidence.years.some((y) => y.pixels > 0)) return 'No valid classification';
  if (!baseYear(evidence)) return `Missing the ${evidence.baselineYear} classification`;
  return `Missing a year after ${evidence.baselineYear}`;
}

/** la primera oración de un motivo largo, sin el punto: lo demás va en la ayuda */
export function firstSentence(text: string | null | undefined): string {
  const clean = (text ?? '').trim();
  const end = clean.search(/\.(\s|$)/);
  return end === -1 ? clean : clean.slice(0, end);
}

/**
 * lo que vio MODIS cuando no hay una declaración con la que compararlo: solo hace falta decir
 * algo si vio un uso distinto (la franja de años ya muestra el resto)
 */
export function modisChangeLine(evidence: LandUseEvidence, mine: boolean): Line | null {
  if (evidence.verdict !== 'possible_change') return null;
  const years = differentYears(evidence);
  const detail = `${forLot(evidence.reason, mine)} Each pixel of about ${pixelSize(evidence)} m mixes the field with its surroundings.`;
  if (years.length) {
    return { tone: 'warn', icon: 'alert', title: `Different use in ${joinList(years)}`, detail };
  }
  if (partialChange(evidence)) {
    return { tone: 'warn', icon: 'alert', title: 'A different use in part of the field', detail };
  }
  return {
    tone: 'neutral',
    icon: 'layers',
    title: `No dominant use in ${evidence.baselineYear}`,
    detail,
  };
}

/**
 * la comparación en una línea, con el porqué para la ayuda. nunca acusa: si no coincide,
 * puede ser un error de clasificación del satélite, que mezcla el lote con lo que lo rodea
 */
export function matchLine(
  match: LandUseMatch,
  evidence: LandUseEvidence | null,
  modisError: string | null,
): Line {
  const pixel = `each pixel of about ${pixelSize(evidence)} m`;
  switch (match) {
    case 'pending':
      return {
        tone: 'neutral',
        icon: 'sync',
        title: 'Comparing with what MODIS saw…',
        detail: '',
      };
    case 'match': {
      const base = evidence ? baseYear(evidence) : undefined;
      const noun = base?.group ? GROUP_NOUNS[base.group] : 'the same use';
      return {
        tone: 'ok',
        icon: 'check',
        title: 'Supported by what MODIS saw',
        detail: `You declared no change, and MODIS saw ${noun} in every year with data, from ${evidence?.baselineYear} to ${evidence?.lastYear}. It is indicative: ${pixel} mixes your field with its surroundings, so a small change may not show.`,
      };
    }
    case 'mismatch': {
      const where = evidence ? changeWhere(evidence) : '';
      // en parte del lote, el motivo de core/nasa dice en qué año y en cuántos píxeles
      const why = evidence && partialChange(evidence) ? ` ${evidence.reason}` : '';
      const seen = where
        ? `MODIS saw a different use ${where}.${why}`
        : `MODIS did not see a dominant use in ${evidence?.baselineYear}.`;
      return {
        tone: 'warn',
        icon: 'alert',
        title: 'Does not match MODIS: review it',
        detail: `${seen} It may be a satellite classification error: ${pixel} mixes your field with its surroundings. If your declaration is correct, leave it as it is.`,
      };
    }
    case 'unconfirmed':
      return {
        tone: 'neutral',
        icon: 'layers',
        title: 'MODIS is not enough to confirm it',
        detail: `${firstSentence(evidence?.reason)}. It does not contradict your declaration, but it does not support it either: ${pixel} mixes your field with its surroundings.`,
      };
    case 'declared_change': {
      let seen = '';
      if (evidence?.verdict === 'possible_change') {
        const where = changeWhere(evidence);
        seen = where
          ? ` MODIS also saw a different use ${where}.`
          : ' MODIS cannot confirm that the use stayed the same either.';
      } else if (evidence?.verdict === 'unchanged') {
        seen = ` MODIS did not see it: with ${pixel}, a small change may not show.`;
      }
      return {
        tone: 'info',
        icon: 'info',
        title: 'With a change, the practice is not met',
        detail: `With a land-use change since 2020, the field does not meet the “No land-use change since 2020” practice.${seen}`,
      };
    }
    case 'no_modis':
      return {
        tone: 'neutral',
        icon: 'minus',
        title: 'No MODIS data to compare',
        detail: evidence?.reason ?? modisError ?? '',
      };
  }
}

/** fecha y hora ISO como "15/11/2026", en la zona horaria de quien mira */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
