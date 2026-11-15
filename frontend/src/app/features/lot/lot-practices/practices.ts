import { CriterionStatus, ScoreCriterion } from '../../../core/models';
import { IconName } from '../../../shared/ui/icon/icons';

/** adónde lleva el enlace de una recomendación */
export type PracticeLinkKind = 'footprint' | 'fertilization' | 'log';

export interface PracticeLink {
  kind: PracticeLinkKind;
  text: string;
}

/** una recomendación destacada, armada a partir de un criterio del puntaje */
export interface Recommendation {
  key: string;
  status: Exclude<CriterionStatus, 'cumple'>;
  statusLabel: string;
  /** la acción concreta, en lenguaje llano */
  action: string;
  /** una línea: por qué importa */
  why: string;
  link: PracticeLink | null;
}

interface Advice {
  action: string;
  why: string;
  link?: PracticeLink;
}

/**
 * buenas prácticas agronómicas por criterio del puntaje (backend/carbon/score.py). solo
 * afirmaciones cualitativas: ningún número, porque ninguno tendría fuente
 */
const ADVICE: Record<string, Advice> = {
  winter_cover: {
    action: 'Sumá un cultivo de cobertura entre la cosecha y la próxima siembra.',
    why: 'Mantiene el suelo cubierto en invierno: lo protege de la erosión, suma materia orgánica y compite con las malezas.',
    link: {
      kind: 'footprint',
      text: 'Mirá en el simulador el efecto de sumar cobertura en la huella',
    },
  },
  no_till: {
    action: 'Sembrá sin remover el suelo (siembra directa).',
    why: 'Conserva la humedad y la materia orgánica, y deja el suelo menos expuesto a la erosión.',
  },
  rotation: {
    action: 'Alterná cultivos entre campañas: por ejemplo, maíz o trigo después de soja.',
    why: 'Corta el ciclo de plagas, enfermedades y malezas, y mejora la estructura del suelo.',
    link: { kind: 'fertilization', text: 'Planificá la fertilización del próximo cultivo' },
  },
  no_burn: {
    action: 'No quemes el rastrojo: dejalo sobre el suelo como cobertura.',
    why: 'La quema deja el suelo desnudo y se pierden la materia orgánica y los nutrientes del rastrojo.',
  },
  no_land_use_change_since_2020: {
    action: 'Conservá los montes, pastizales naturales y humedales que quedan en el campo.',
    why: 'Convertirlos en cultivo libera el carbono que guardaban la vegetación y el suelo, y suma a la huella del lote.',
  },
};

/** un evento detectado que hace "no cumplir" se puede revisar (y corregir) en la bitácora */
const LOG_LINK: PracticeLink = {
  kind: 'log',
  text: 'Revisá en la bitácora lo que detectó el satélite',
};

/**
 * orden dentro de cada grupo: primero lo que más suele estar al alcance de un productor de la
 * zona. no es un peso del puntaje: los pesos viven en backend/carbon/score_config.yaml
 */
const PRIORITY = [
  'winter_cover',
  'no_till',
  'rotation',
  'no_burn',
  'no_land_use_change_since_2020',
];

export const STATUS_ICONS: Record<CriterionStatus, IconName> = {
  cumple: 'check',
  no_cumple: 'close',
  sin_dato: 'minus',
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

/**
 * hasta `max` recomendaciones: primero lo que no cumple, después lo que falta medir. un
 * criterio que el backend sume y no tenga consejo propio usa su rótulo y su motivo, sin
 * inventar nada
 */
export function pickRecommendations(
  criteria: readonly ScoreCriterion[],
  max = 3,
): Recommendation[] {
  const group = (criterion: ScoreCriterion) => (criterion.status === 'no_cumple' ? 0 : 1);
  const order = (key: string) => {
    const index = PRIORITY.indexOf(key);
    return index === -1 ? PRIORITY.length : index;
  };
  return criteria
    .filter((criterion) => criterion.status !== 'cumple')
    .sort((a, b) => group(a) - group(b) || order(a.key) - order(b.key))
    .slice(0, max)
    .map((criterion) => {
      const advice = ADVICE[criterion.key];
      const detected = criterion.status === 'no_cumple' && criterion.evidence.length > 0;
      return {
        key: criterion.key,
        status: criterion.status as Recommendation['status'],
        statusLabel: statusLabel(criterion),
        action: advice?.action ?? criterion.label,
        why: advice?.why ?? criterion.reason,
        link: detected ? LOG_LINK : (advice?.link ?? null),
      };
    });
}
