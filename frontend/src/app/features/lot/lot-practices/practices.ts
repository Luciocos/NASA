import { Params } from '@angular/router';

import { CriterionStatus, LandUseDeclaration, Origin, ScoreCriterion } from '../../../core/models';
import { IconName } from '../../../shared/ui/icon/icons';
import { LotTabKey } from '../../../shared/ui/lot-tabs/lot-tabs';
import { LAND_USE_KEY, LandUseMatch, ModisStatus, formatDay } from './land-use/land-use';

/** cómo se pinta un estado: chip verde, ámbar o gris, siempre con ícono y texto */
export type StatusTone = 'ok' | 'warn' | 'neutral';

/** el enlace corto de una recomendación a la pestaña donde se sigue */
export interface RecommendationLink {
  /** pocas palabras: "Simular en Huella" */
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
    action: 'Sumá un cultivo de cobertura en invierno.',
    why: 'Cubre el suelo entre la cosecha y la siembra: lo protege de la erosión, suma materia orgánica y compite con las malezas.',
    where: 'En la pestaña Huella podés simular el efecto de sumarlo.',
    link: { label: 'Simular en Huella', tab: 'footprint', params: { vista: 'simulador' } },
  },
  no_till: {
    action: 'Sembrá sin remover el suelo.',
    why: 'La siembra directa conserva la humedad y la materia orgánica, y deja el suelo menos expuesto a la erosión.',
  },
  rotation: {
    action: 'Alterná cultivos entre campañas.',
    why: 'Por ejemplo, maíz o trigo después de soja: corta el ciclo de plagas, enfermedades y malezas, y mejora la estructura del suelo.',
    where: 'En la pestaña Fertilización podés planificar el próximo cultivo.',
    link: { label: 'Ir a Fertilización', tab: 'fertilization' },
  },
  no_burn: {
    action: 'Dejá el rastrojo como cobertura, sin quemarlo.',
    why: 'La quema deja el suelo desnudo y se pierden la materia orgánica y los nutrientes del rastrojo.',
  },
  [LAND_USE_KEY]: {
    action: 'Conservá montes, pastizales y humedales.',
    why: 'Convertirlos en cultivo libera el carbono que guardaban la vegetación y el suelo, y suma a la huella del lote.',
  },
};

/** lo que no cumple por un evento detectado se puede revisar (y corregir) en la bitácora */
const DETECTED = 'Lo detectó el satélite: podés revisarlo en la pestaña Bitácora.';
const DETECTED_LINK: RecommendationLink = { label: 'Revisar en Bitácora', tab: 'log' };

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
  cumple: 'Cumple',
  no_cumple: 'No cumple',
  sin_dato: 'Sin dato',
};

/** texto del estado: el del backend, o el propio si no vino */
export function statusLabel(criterion: Pick<ScoreCriterion, 'status' | 'status_label'>): string {
  return criterion.status_label || STATUS_LABELS[criterion.status];
}

/** el nombre sin la aclaración final entre paréntesis: la completa está en "Cómo se calcula" */
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
        action: advice?.action ?? shortLabel(criterion.label),
        why: advice?.why ?? criterion.reason,
        now: `Hoy figura como «${statusLabel(criterion)}»: ${criterion.reason}`,
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
  /** texto del chip: el estado, o "Revisar" si lo declarado no coincide con MODIS */
  chip: string;
  icon: IconName;
  tone: StatusTone;
  origin: Origin | null;
  hypothetical: boolean;
  /** la fila muestra lo que declaró el productor, que el puntaje provisional todavía no suma */
  declared: boolean;
  /** la ayuda (i) de la fila, o null */
  note: string | null;
  /** el nombre de esa ayuda */
  noteLabel: string;
}

/** sin declaración, el puntaje da por cumplido el uso del suelo y MODIS vio otro uso */
const UNDECLARED_REVIEW =
  'El puntaje lo da por cumplido porque la bitácora no tiene un cambio de uso, pero MODIS vio un uso distinto: miralo en «Uso del suelo desde 2020».';

/**
 * las filas de la lista. con una declaración de uso del suelo, su fila muestra lo declarado
 * (DECLARED) para no contradecir a la tarjeta de uso del suelo: "Revisar" si no coincide con
 * MODIS. la ayuda aclara que el puntaje provisional todavía no la suma y qué figura ahí. sin
 * declaración tampoco la contradice: si el puntaje la da por cumplida y MODIS vio un uso
 * distinto (`modis`), la fila pide revisarla
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
      label: shortLabel(criterion.label),
      status: criterion.status,
      chip: statusLabel(criterion),
      icon: STATUS_ICONS[criterion.status],
      tone: STATUS_TONES[criterion.status],
      origin: criterion.origin,
      hypothetical: criterion.hypothetical,
      declared: false,
      note: null,
      noteLabel: 'Tu declaración y el puntaje',
    };
    if (criterion.key !== LAND_USE_KEY) return row;
    if (!declaration) {
      if (criterion.status !== 'cumple' || modis !== 'possible_change') return row;
      return {
        ...row,
        chip: 'Revisar',
        icon: 'alert',
        tone: 'warn',
        note: UNDECLARED_REVIEW,
        noteLabel: 'MODIS y el puntaje',
      };
    }

    const status: CriterionStatus = declaration.unchanged ? 'cumple' : 'no_cumple';
    const review = declaration.unchanged && match === 'mismatch';
    const said = declaredNote(declaration, match);
    return {
      ...row,
      status,
      chip: review ? 'Revisar' : STATUS_LABELS[status],
      icon: review ? 'alert' : STATUS_ICONS[status],
      tone: review ? 'warn' : STATUS_TONES[status],
      origin: declaration.origin,
      hypothetical: false,
      declared: true,
      note: `${said} El puntaje provisional todavía no suma tu declaración: ahí figura como «${statusLabel(criterion)}».`,
    };
  });
}

/** qué se declaró y cómo quedó frente a MODIS, en una oración para la ayuda de la fila */
function declaredNote(declaration: LandUseDeclaration, match: LandUseMatch | null): string {
  const day = formatDay(declaration.declared_at);
  if (!declaration.unchanged) return `Declaraste el ${day} que hubo un cambio de uso del suelo.`;
  if (match === 'match') return `Lo declaraste el ${day} y lo respalda lo que vio MODIS.`;
  if (match === 'mismatch') {
    return `Declaraste el ${day} que no cambió, pero no coincide con lo que vio MODIS: revisalo en «Uso del suelo desde 2020».`;
  }
  if (match === 'unconfirmed') return `Lo declaraste el ${day}; MODIS no alcanza para confirmarlo.`;
  return `Lo declaraste el ${day}.`;
}
