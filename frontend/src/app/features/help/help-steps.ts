import type { LotTabKey } from '../../shared/ui/lot-tabs/lot-tabs';

/**
 * los pasos de la guía de ayuda, en el orden de la app: marcar el lote, abrirlo y sus pestañas
 * de izquierda a derecha, como en la fila del popup (así Siguiente lleva a la pestaña de al
 * lado), con el pasaporte al final. cuando el paso pasa en una pestaña del popup del lote, su
 * clave es la misma que esa sección en la dirección (?seccion=huella)
 */
export type HelpStepKey =
  | 'marcar'
  | 'abrir'
  | 'satelite'
  | 'huella'
  | 'practicas'
  | 'rentabilidad'
  | 'fertilizacion'
  | 'bitacora'
  | 'pasaporte';

export interface HelpStep {
  key: HelpStepKey;
  /** lo único que se lee debajo de la imagen: cinco o seis palabras como mucho */
  caption: string;
  /** lo que muestra la imagen, para el lector de pantalla */
  description: string;
  /** la pestaña del popup del lote en la que pasa, si pasa en una */
  tab: LotTabKey | null;
}

export const HELP_STEPS: readonly HelpStep[] = [
  {
    key: 'marcar',
    caption: 'Add your field and save it',
    description:
      'Add field: on the satellite image, tap the corners of your field one by one, then the green Save field button.',
    tab: null,
  },
  {
    key: 'abrir',
    caption: 'Open your field with the magnifier',
    description:
      'My fields: in the Your fields list, the magnifier next to each field opens its details with the tabs.',
    tab: null,
  },
  {
    key: 'satelite',
    caption: 'See what the satellite sees',
    description:
      'Satellite tab of the field details: greenness, rainfall and soil moisture, plus the greenness curve for the last year.',
    tab: 'satellite',
  },
  {
    key: 'bitacora',
    caption: 'Confirm or correct each event',
    description:
      'Field log tab: open an event detected by satellite, check its evidence and tap Confirm, or Correct if something does not match. Events show up once satellite processing delivers them.',
    tab: 'log',
  },
  {
    key: 'practicas',
    caption: 'Declare your land use',
    description:
      'Practices tab: in the Land use card, tap the answer that applies, No change in use or Yes, it changed.',
    tab: 'practices',
  },
  {
    key: 'huella',
    caption: 'Enter yield and inputs',
    description:
      'Footprint tab: the green Enter yield and inputs button opens what you need to fill in.',
    tab: 'footprint',
  },
  {
    key: 'fertilizacion',
    caption: 'Plan the rate for each zone',
    description:
      'Fertilization tab: the field split into zones by greenness and, in the Variable rate nitrogen card, the green Plan rates button.',
    tab: 'fertilization',
  },
  {
    key: 'rentabilidad',
    caption: 'Enter price, yield and costs',
    description:
      'Profitability tab: fill in the grain price, the yield and, further down, costs and expenses.',
    tab: 'profit',
  },
  {
    key: 'pasaporte',
    caption: 'Share the field passport',
    description: 'Passport tab: the green Share passport button copies a link you can send.',
    tab: 'passport',
  },
];

/**
 * el paso en el que abre la guía: una clave de paso ('huella') o la pestaña del popup del lote
 * ('footprint'). sin paso, o con uno que no existe, arranca en el primero
 */
export function helpStepIndex(step: string | null | undefined): number {
  if (!step) return 0;
  const key = step.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const index = HELP_STEPS.findIndex((item) => item.key === key || item.tab === key);
  return Math.max(0, index);
}
