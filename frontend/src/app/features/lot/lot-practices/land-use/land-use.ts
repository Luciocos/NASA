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
 * otro uso, solo no alcanza para decir cuál había
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
  agricultural: 'Agrícola',
  natural: 'Natural',
  urban: 'Urbano',
  other: 'Sin vegetación',
};

const GROUP_NOUNS: Record<LandUseGroup, string> = {
  agricultural: 'uso agrícola',
  natural: 'vegetación natural',
  urban: 'área urbana',
  other: 'agua, nieve o suelo desnudo',
};

/** "a", "a y b", "a, b y c" */
export function joinList(items: readonly (string | number)[]): string {
  const texts = items.map(String);
  return texts.length < 2
    ? (texts[0] ?? '')
    : `${texts.slice(0, -1).join(', ')} y ${texts[texts.length - 1]}`;
}

/** el estado de la consulta a MODIS, reducido a lo que importa para comparar */
export function modisStatus(state: LoadState<LandUseEvidence>): ModisStatus {
  const evidence = state.data;
  if (evidence) {
    const unclear = evidence.verdict === 'possible_change' && !differentYears(evidence).length;
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

/** el grupo de un año en una o dos palabras: "Agrícola", "Mixto" (empate), "Sin dato" */
export function yearLabel(year: LandUseYear): string {
  if (!year.pixels) return 'Sin dato';
  return year.group === null ? 'Mixto' : GROUP_SHORT[year.group];
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
  if (!year.pixels) return 'sin dato.';
  const pixels = `${year.pixels} ${year.pixels === 1 ? 'píxel' : 'píxeles'} con dato`;
  const share =
    year.agriculturalShare === null
      ? ''
      : `, ${Math.round(year.agriculturalShare * 100)} % con uso agrícola`;
  if (year.group === null) return `sin un uso dominante (empate entre usos); ${pixels}${share}.`;
  const igbp =
    year.classId !== null && year.classLabel
      ? `, clase IGBP ${year.classId} (${year.classLabel})`
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
    (run) => `${run.from === run.to ? run.from : `${run.from} a ${run.to}`}: ${run.text}`,
  );
}

/** cuántos píxeles cubren el lote, para la ayuda */
export function pixelText(evidence: LandUseEvidence, mine: boolean): string {
  if (!evidence.pixelCount) return '';
  const size = pixelSize(evidence);
  const lot = mine ? 'tu lote' : 'este lote';
  const count = evidence.pixelCount;
  return evidence.centroidFallback
    ? `Ningún píxel de unos ${size} m tiene su centro dentro de ${lot}: se usó el que contiene su centro.`
    : `${count} ${count === 1 ? 'píxel' : 'píxeles'} de unos ${size} m ${count === 1 ? 'cubre' : 'cubren'} ${lot}.`;
}

/**
 * los textos de core/nasa hablan de "tu lote": en un lote ajeno (un ejemplo) se dice "este lote"
 */
export function forLot(text: string, mine: boolean): string {
  return mine
    ? text
    : text.replace(/\btu lote\b/g, 'este lote').replace(/\bTu lote\b/g, 'Este lote');
}

/** el motivo de "Sin dato" en pocas palabras; el completo (evidence.reason) va en la ayuda */
export function noDataShort(evidence: LandUseEvidence): string {
  if (!evidence.pixelCount) return 'No hay píxeles sobre el lote';
  if (!evidence.years.some((y) => y.pixels > 0)) return 'Sin una clasificación válida';
  if (!baseYear(evidence)) return `Falta la clasificación de ${evidence.baselineYear}`;
  return `Falta un año después de ${evidence.baselineYear}`;
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
  const detail = `${forLot(evidence.reason, mine)} Cada píxel de unos ${pixelSize(evidence)} m mezcla el lote con lo que lo rodea.`;
  return years.length
    ? { tone: 'warn', icon: 'alert', title: `Uso distinto en ${joinList(years)}`, detail }
    : {
        tone: 'neutral',
        icon: 'layers',
        title: `Sin un uso claro en ${evidence.baselineYear}`,
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
  const pixel = `cada píxel de unos ${pixelSize(evidence)} m`;
  switch (match) {
    case 'pending':
      return {
        tone: 'neutral',
        icon: 'sync',
        title: 'Comparando con lo que vio MODIS…',
        detail: '',
      };
    case 'match': {
      const base = evidence ? baseYear(evidence) : undefined;
      const noun = base?.group ? GROUP_NOUNS[base.group] : 'el mismo uso';
      return {
        tone: 'ok',
        icon: 'check',
        title: 'Respaldado por lo que vio MODIS',
        detail: `Declaraste que no cambió y MODIS vio ${noun} en cada año con dato, de ${evidence?.baselineYear} a ${evidence?.lastYear}. Es orientativo: ${pixel} mezcla tu lote con lo que lo rodea, así que un cambio chico puede no verse.`,
      };
    }
    case 'mismatch': {
      const years = evidence ? differentYears(evidence) : [];
      const seen = years.length
        ? `MODIS vio un uso distinto en ${joinList(years)}.`
        : `MODIS no vio un uso dominante en ${evidence?.baselineYear}.`;
      return {
        tone: 'warn',
        icon: 'alert',
        title: 'No coincide con MODIS: revisalo',
        detail: `${seen} Puede ser un error de clasificación del satélite: ${pixel} mezcla tu lote con lo que lo rodea. Si tu declaración es correcta, dejala como está.`,
      };
    }
    case 'unconfirmed':
      return {
        tone: 'neutral',
        icon: 'layers',
        title: 'MODIS no alcanza para confirmarlo',
        detail: `${firstSentence(evidence?.reason)}. No contradice tu declaración, pero tampoco la respalda: ${pixel} mezcla tu lote con lo que lo rodea.`,
      };
    case 'declared_change': {
      let seen = '';
      if (evidence?.verdict === 'possible_change') {
        const years = differentYears(evidence);
        seen = years.length
          ? ` MODIS también vio un uso distinto en ${joinList(years)}.`
          : ' MODIS tampoco puede confirmar que el uso siguió igual.';
      } else if (evidence?.verdict === 'unchanged') {
        seen = ` MODIS no lo vio: con ${pixel}, un cambio chico puede no verse.`;
      }
      return {
        tone: 'info',
        icon: 'info',
        title: 'Con un cambio, la práctica no se cumple',
        detail: `Con un cambio de uso desde 2020, el lote no cumple la práctica «Sin cambio de uso del suelo desde 2020».${seen}`,
      };
    }
    case 'no_modis':
      return {
        tone: 'neutral',
        icon: 'minus',
        title: 'Sin dato de MODIS para comparar',
        detail: evidence?.reason ?? modisError ?? '',
      };
  }
}

/** fecha y hora ISO como "15/11/2026", en la zona horaria de quien mira */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
