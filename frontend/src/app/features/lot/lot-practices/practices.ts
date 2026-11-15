import { Params } from '@angular/router';

import { CriterionStatus, LandUseDeclaration, Origin, ScoreCriterion } from '../../../core/models';
import { IconName } from '../../../shared/ui/icon/icons';
import { LotTabKey } from '../../../shared/ui/lot-tabs/lot-tabs';
import { criterionLabel } from '../../footprint/format';
import { LAND_USE_KEY, LandUseMatch, ModisStatus, formatDay } from './land-use/land-use';

export { criterionLabel };

/** cómo se pinta un estado: chip verde, ámbar o gris, siempre con ícono y texto */
export type StatusTone = 'ok' | 'warn' | 'neutral';

/** el enlace corto de una recomendación a la pestaña donde se sigue */
export interface RecommendationLink {
  /** pocas palabras: "Simulate in Footprint" */
  label: string;
  tab: LotTabKey;
  /** la consulta que abre la vista justa de la pestaña (por ejemplo, el simulador de la huella) */
  params?: Params;
}

/** una recomendación destacada: una frase a la vista; el resto, en la ayuda (i) */
export interface Recommendation {
  key: string;
  status: Exclude<CriterionStatus, 'cumple'>;
  /** la acción concreta, en una frase corta */
  action: string;
  /** por qué importa */
  why: string;
  /** cómo figura hoy en el puntaje y por qué, con el motivo del backend */
  now: string;
  /** dónde seguir en las pestañas del lote, o null */
  where: string | null;
  /** el enlace a esa pestaña, o null */
  link: RecommendationLink | null;
}

interface Advice {
  action: string;
  why: string;
  where?: string;
  link?: RecommendationLink;
}

/**
 * buenas prácticas agronómicas por criterio del puntaje (backend/carbon/score.py). solo
 * afirmaciones cualitativas: ningún número, porque ninguno tendría fuente
 */
const ADVICE: Record<string, Advice> = {
  winter_cover: {
    action: 'Add a winter cover crop.',
    why: 'It covers the soil between harvest and sowing: it protects it from erosion, adds organic matter and competes with weeds.',
    where: 'In the Footprint tab you can simulate the effect of adding one.',
    link: { label: 'Simulate in Footprint', tab: 'footprint', params: { vista: 'simulador' } },
  },
  no_till: {
    action: 'Sow without disturbing the soil.',
    why: 'No-till keeps moisture and organic matter in the soil, and leaves it less exposed to erosion.',
  },
  rotation: {
    action: 'Rotate crops between seasons.',
    why: 'For example, corn or wheat after soybean: it breaks the cycle of pests, diseases and weeds, and improves soil structure.',
    where: 'In the Fertilization tab you can plan the next crop.',
    link: { label: 'Go to Fertilization', tab: 'fertilization' },
  },
  no_burn: {
    action: 'Leave the crop residue as cover, without burning it.',
    why: 'Burning leaves the soil bare, and the organic matter and nutrients in the residue are lost.',
  },
  [LAND_USE_KEY]: {
    action: 'Keep native woodland, grasslands and wetlands.',
    why: 'Turning them into cropland releases the carbon stored in the vegetation and the soil, and adds to the field’s footprint.',
  },
};

/** lo que no cumple por un evento detectado se puede revisar (y corregir) en la bitácora */
const DETECTED = 'Detected by satellite: you can review it in the Field log tab.';
const DETECTED_LINK: RecommendationLink = { label: 'Review in Field log', tab: 'log' };

/**
 * orden dentro de cada grupo: primero lo que más suele estar al alcance de un productor de la
 * zona. no es un peso del puntaje: los pesos viven en backend/carbon/score_config.yaml
 */
const PRIORITY = ['winter_cover', 'no_till', 'rotation', 'no_burn', LAND_USE_KEY];

export const STATUS_ICONS: Record<CriterionStatus, IconName> = {
  cumple: 'check',
  no_cumple: 'close',
  sin_dato: 'minus',
};

export const STATUS_TONES: Record<CriterionStatus, StatusTone> = {
  cumple: 'ok',
  no_cumple: 'warn',
  sin_dato: 'neutral',
};

const STATUS_LABELS: Record<CriterionStatus, string> = {
  cumple: 'Met',
  no_cumple: 'Not met',
  sin_dato: 'No data',
};

/** texto del estado: el propio por clave (en inglés), o el del backend si la clave es nueva */
export function statusLabel(criterion: Pick<ScoreCriterion, 'status' | 'status_label'>): string {
  return STATUS_LABELS[criterion.status] || criterion.status_label;
}

/** el nombre sin la aclaración final entre paréntesis: la completa está en "How it is calculated" */
export function shortLabel(label: string): string {
  return label.replace(/\s*\([^()]*\)\s*$/, '') || label;
}

/**
 * hasta `max` recomendaciones: primero lo que no cumple, después lo que falta medir. un
 * criterio que el backend sume y no tenga consejo propio usa su rótulo y su motivo, sin
 * inventar nada. los criterios de `skip` no se recomiendan (por ejemplo, el uso del suelo ya
 * declarado, que tiene su propia tarjeta)
 */
export function pickRecommendations(
  criteria: readonly ScoreCriterion[],
  max = 3,
  skip: readonly string[] = [],
): Recommendation[] {
  const group = (criterion: ScoreCriterion) => (criterion.status === 'no_cumple' ? 0 : 1);
  const order = (key: string) => {
    const index = PRIORITY.indexOf(key);
    return index === -1 ? PRIORITY.length : index;
  };
  return criteria
    .filter((criterion) => criterion.status !== 'cumple' && !skip.includes(criterion.key))
    .sort((a, b) => group(a) - group(b) || order(a.key) - order(b.key))
    .slice(0, max)
    .map((criterion) => {
      const advice = ADVICE[criterion.key];
      const detected = criterion.status === 'no_cumple' && criterion.evidence.length > 0;
      return {
        key: criterion.key,
        status: criterion.status as Recommendation['status'],
        action: advice?.action ?? shortLabel(criterionLabel(criterion)),
        why: advice?.why ?? criterion.reason,
        now: `It currently shows as “${statusLabel(criterion)}”: ${criterion.reason}`,
        where: detected ? DETECTED : (advice?.where ?? null),
        link: detected ? DETECTED_LINK : (advice?.link ?? null),
      };
    });
}

/** una fila de "Cómo está cada práctica": chip con ícono y texto, nombre y origen */
export interface PracticeRow {
  key: string;
  /** el nombre corto (shortLabel) */
  label: string;
  /** el estado que muestra la fila: el del puntaje, o el declarado */
  status: CriterionStatus;
  /** texto del chip: el estado, o "Review" si lo declarado no coincide con MODIS */
  chip: string;
  icon: IconName;
  tone: StatusTone;
  origin: Origin | null;
  hypothetical: boolean;
  /** la fila muestra lo que declaró el productor (no lo que dice un evento de la bitácora) */
  declared: boolean;
  /** la ayuda (i) de la fila, o null */
  note: string | null;
  /** el nombre de esa ayuda */
  noteLabel: string;
}

/** sin declaración, el puntaje da por cumplido el uso del suelo y MODIS vio otro uso */
const UNDECLARED_REVIEW =
  'The score counts it as met because the field log has no land-use change, but MODIS saw a different use: check “Land use since 2020”.';

/**
 * las filas de la lista. el puntaje y la huella usan la declaración de uso del suelo, salvo que
 * la bitácora registre un cambio de uso detectado, que manda (backend/carbon/score.py)
 *
 * con una declaración, su fila muestra lo declarado (DECLARED) para no contradecir a la tarjeta
 * de uso del suelo: "Revisar" si no coincide con MODIS. la ayuda dice si el puntaje ya la usa
 * (mientras se vuelve a pedir después de declarar, todavía no). si la bitácora tiene el cambio
 * detectado, la fila muestra ese evento y pide revisarlo si lo declarado dice otra cosa. sin
 * declaración tampoco contradice a la tarjeta: si el puntaje la da por cumplida y MODIS vio un
 * uso distinto (`modis`), la fila pide revisarla
 */
export function practiceRows(
  criteria: readonly ScoreCriterion[],
  declaration: LandUseDeclaration | null,
  match: LandUseMatch | null,
  modis: ModisStatus | null = null,
): PracticeRow[] {
  return criteria.map((criterion) => {
    const row: PracticeRow = {
      key: criterion.key,
      label: shortLabel(criterionLabel(criterion)),
      status: criterion.status,
      chip: statusLabel(criterion),
      icon: STATUS_ICONS[criterion.status],
      tone: STATUS_TONES[criterion.status],
      origin: criterion.origin,
      hypothetical: criterion.hypothetical,
      declared: false,
      note: null,
      noteLabel: 'Your declaration and the score',
    };
    if (criterion.key !== LAND_USE_KEY) return row;
    if (!declaration) {
      if (criterion.status !== 'cumple' || modis !== 'possible_change') return row;
      return {
        ...row,
        chip: 'Review',
        icon: 'alert',
        tone: 'warn',
        note: UNDECLARED_REVIEW,
        noteLabel: 'MODIS and the score',
      };
    }

    // el satélite detectó un cambio de uso: el puntaje usa ese evento y no la declaración
    if (criterion.status === 'no_cumple' && criterion.evidence.length > 0) {
      const day = formatDay(declaration.declared_at);
      return declaration.unchanged
        ? {
            ...row,
            chip: 'Review',
            icon: 'alert',
            tone: 'warn',
            note: `On ${day} you declared no change, but the field log records a land-use change: the score and the footprint use that event. Review it in the Field log tab.`,
          }
        : {
            ...row,
            note: `On ${day} you declared a land-use change, and the field log records it too: the score and the footprint use that event.`,
          };
    }

    const status: CriterionStatus = declaration.unchanged ? 'cumple' : 'no_cumple';
    const review = declaration.unchanged && match === 'mismatch';
    const said = declaredNote(declaration, match);
    // recién declarado, el puntaje se vuelve a pedir: hasta que llega no se dice que la usa
    const counted = criterion.origin === 'DECLARED';
    return {
      ...row,
      status,
      chip: review ? 'Review' : STATUS_LABELS[status],
      icon: review ? 'alert' : STATUS_ICONS[status],
      tone: review ? 'warn' : STATUS_TONES[status],
      origin: declaration.origin,
      hypothetical: false,
      declared: true,
      note: counted
        ? `${said} The provisional score and the footprint use your declaration.`
        : said,
    };
  });
}

/** qué se declaró y cómo quedó frente a MODIS, en una oración para la ayuda de la fila */
function declaredNote(declaration: LandUseDeclaration, match: LandUseMatch | null): string {
  const day = formatDay(declaration.declared_at);
  if (!declaration.unchanged) return `On ${day} you declared a land-use change.`;
  if (match === 'match') return `You declared it on ${day}, and what MODIS saw supports it.`;
  if (match === 'mismatch') {
    return `On ${day} you declared no change, but it does not match what MODIS saw: check it in “Land use since 2020”.`;
  }
  if (match === 'unconfirmed')
    return `You declared it on ${day}; MODIS is not enough to confirm it.`;
  return `You declared it on ${day}.`;
}
