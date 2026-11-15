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
    caption: 'Marcá tu lote y guardalo',
    description:
      'Marcar lote: sobre la imagen satelital se tocan las esquinas del lote, una por una, y después el botón verde Guardar lote.',
    tab: null,
  },
  {
    key: 'abrir',
    caption: 'Abrí tu lote con la lupa',
    description:
      'Mi campo: en la lista Tus lotes, la lupa al lado de cada lote abre su ficha con las pestañas.',
    tab: null,
  },
  {
    key: 'satelite',
    caption: 'Mirá lo que ve el satélite',
    description:
      'Pestaña Satélite de la ficha del lote: el verdor, la lluvia y la humedad del suelo, y la curva del verdor del último año.',
    tab: 'satellite',
  },
  {
    key: 'bitacora',
    caption: 'Confirmá o corregí cada evento',
    description:
      'Pestaña Bitácora: se abre un evento detectado por satélite, se mira su evidencia y se toca Confirmar, o Corregir si algo no coincide. Los eventos aparecen cuando el procesamiento satelital los entrega.',
    tab: 'log',
  },
  {
    key: 'practicas',
    caption: 'Declará el uso del suelo',
    description:
      'Pestaña Prácticas: en la tarjeta Uso del suelo se toca la respuesta que corresponde, No cambié el uso o Sí, hubo un cambio.',
    tab: 'practices',
  },
  {
    key: 'huella',
    caption: 'Cargá rinde e insumos',
    description:
      'Pestaña Huella: el botón verde Cargar rinde e insumos abre lo que tenés que completar.',
    tab: 'footprint',
  },
  {
    key: 'fertilizacion',
    caption: 'Armá la dosis por ambiente',
    description:
      'Pestaña Fertilización: el lote partido en ambientes según su verdor y, en la tarjeta Dosis variable de nitrógeno, el botón verde Armar dosis.',
    tab: 'fertilization',
  },
  {
    key: 'rentabilidad',
    caption: 'Poné precio, rinde y costos',
    description:
      'Pestaña Rentabilidad: se completan el precio del grano, el rinde y, más abajo, los costos y gastos.',
    tab: 'profit',
  },
  {
    key: 'pasaporte',
    caption: 'Compartí el pasaporte del lote',
    description:
      'Pestaña Pasaporte: el botón verde Compartir pasaporte copia un enlace para mandar.',
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
