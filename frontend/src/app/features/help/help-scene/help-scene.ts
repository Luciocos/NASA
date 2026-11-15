import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ISO_GLYPH_PATHS } from '../../../shared/iso/glyphs';
import { ICON_PATHS } from '../../../shared/ui/icon/icons';
import type { LotTabKey } from '../../../shared/ui/lot-tabs/lot-tabs';
import { HELP_STEPS, HelpStepKey } from '../help-steps';

let nextId = 0;

/** una pestaña de la fila del popup dibujada en miniatura */
interface SceneTab {
  key: LotTabKey;
  label: string;
  icon: string;
  /** dónde empieza y cuánto ocupa, en unidades del dibujo */
  x: number;
  width: number;
  active: boolean;
}

/**
 * las seis pestañas del popup del lote, con el rótulo y el ícono de la interfaz real (los de
 * lot-tabs). `labelWidth` es lo que ocupa el rótulo en negrita a 9 unidades, con un 10 % de
 * aire para las fuentes del sistema de cada equipo
 */
const TABS: readonly { key: LotTabKey; label: string; icon: string; labelWidth: number }[] = [
  { key: 'satellite', label: 'Satélite', icon: ICON_PATHS.satellite, labelWidth: 39 },
  { key: 'log', label: 'Bitácora', icon: ICON_PATHS.calendar, labelWidth: 42 },
  { key: 'practices', label: 'Prácticas', icon: ICON_PATHS.check, labelWidth: 47 },
  { key: 'footprint', label: 'Huella', icon: ICON_PATHS.footprint, labelWidth: 32 },
  { key: 'fertilization', label: 'Fertilización', icon: ICON_PATHS.leaf, labelWidth: 62 },
  { key: 'profit', label: 'Rentabilidad', icon: ICON_PATHS.coins, labelWidth: 63 },
];
/**
 * la mano que toca, con el índice para arriba, dibujada en una caja de 24: la punta del dedo está
 * en (9.5, 3). relleno blanco y borde oscuro: se ve sobre la imagen satelital y sobre el verde
 */
const HAND_PATH =
  'M8 4.5A1.5 1.5 0 0 1 11 4.5V10.2A1.4 1.4 0 0 1 13.8 10.2A1.4 1.4 0 0 1 16.6 10.6A1.4 1.4 0 0 1 19.4 11.2V15.5A5.5 5.5 0 0 1 13.9 21H12.2A5.5 5.5 0 0 1 7.6 18.6L4.7 14.6A1.4 1.4 0 0 1 7 13L8 14.2Z';

/** un punto del dibujo, en sus unidades */
type Point = readonly [number, number];

/** la mano de un paso: sus clases (posición y movimiento) y, si va quieta, dónde */
interface HandPlacement {
  outer: string;
  inner: string;
  transform: string | null;
  style: Record<string, string> | null;
}

/** la mano quieta sobre un punto, que llega y pulsa */
function tap([x, y]: Point): HandPlacement {
  return { outer: 'hand', inner: 'tap', transform: `translate(${x} ${y})`, style: null };
}

/**
 * la mano que toca dos o tres puntos en orden (la pestaña, a veces algo del medio y lo que hay
 * que tocar). los puntos van en --x1/--y1 …; el reposo, sin movimiento, es el último
 */
function sequence(points: readonly Point[]): HandPlacement {
  const kind = points.length === 3 ? 'seq3' : 'seq2';
  const style: Record<string, string> = {};
  points.forEach(([x, y], index) => {
    style[`--x${index + 1}`] = `${x}px`;
    style[`--y${index + 1}`] = `${y}px`;
  });
  return { outer: `hand ${kind}`, inner: `press ${kind}-press`, transform: null, style };
}

/** pasos con la secuencia "pestaña y después el botón" */
const SEQUENCE_STEPS = new Set<HelpStepKey>([
  'huella',
  'practicas',
  'rentabilidad',
  'fertilizacion',
  'bitacora',
]);

/** una pestaña sin rótulo: solo su ícono */
const TAB_IDLE = 24;
/** la pestaña elegida: ícono, rótulo y margen */
const TAB_PAD = 28;

/** colores de los ambientes, los mismos del mapa de fertilización (ZONE_STYLE) */
const ZONES = {
  alto: { fill: '#3d9a4f', line: '#1b6e3a' },
  medio: { fill: '#dcb651', line: '#8a5a00' },
  bajo: { fill: '#c9a27c', line: '#6b4429' },
} as const;

/**
 * cuadros de 250 m pintados por ambiente sobre el lote de la miniatura de fertilización: un
 * dibujo, no un lote real. cada letra es un cuadro (a: alto, m: medio, b: bajo)
 */
const ZONE_ROWS = ['aaammb', 'aammbb', 'ammmbb', 'mmmbbb'];
const ZONE_CELLS = ZONE_ROWS.flatMap((row, r) =>
  [...row].map((code, c) => {
    const zone = code === 'a' ? ZONES.alto : code === 'm' ? ZONES.medio : ZONES.bajo;
    return { x: 30 + c * 20, y: 76 + r * 22, fill: zone.fill, line: zone.line };
  }),
);

/** la fila de pestañas con la elegida abierta (ícono y rótulo) y las demás con su ícono */
function layoutTabs(active: LotTabKey): SceneTab[] {
  let x = 6;
  return TABS.map(({ labelWidth, ...tab }) => {
    const isActive = tab.key === active;
    const width = isActive ? TAB_PAD + labelWidth : TAB_IDLE;
    const shape: SceneTab = { ...tab, x, width, active: isActive };
    x += width;
    return shape;
  });
}

/**
 * miniatura ilustrada de una pantalla de LoTestigo para un paso de la ayuda: la misma familia
 * visual de la app (tarjetas, pestañas, botón verde, íconos reales) en svg, sin valores: los
 * números son rayitas y barras. lo que hay que tocar lleva un aro ámbar y una mano que pulsa;
 * el movimiento se apaga con prefers-reduced-motion y queda el último cuadro, con la mano sobre
 * lo que se toca
 *
 * es una imagen (role="img") con la descripción del paso como nombre: el texto de adentro no se
 * lee por separado
 *
 * @example <app-help-scene step="huella" />
 */
@Component({
  selector: 'app-help-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './help-scene.html',
  styleUrl: './help-scene.css',
})
export class HelpScene {
  readonly step = input.required<HelpStepKey>();

  /** ids únicos para los recortes: dos guías en pantalla nunca se cruzan */
  protected readonly uid = `help-scene-${++nextId}`;
  protected readonly handPath = HAND_PATH;

  protected readonly icons = ICON_PATHS;
  protected readonly sowing = ISO_GLYPH_PATHS.SOWING;

  /** Mi campo: la altura de cada tarjeta de "Tus lotes" (la primera, elegida) */
  protected readonly lotRows = [38, 72, 106];
  /** Satélite: las tres tarjetas de indicador, con su ícono, el largo del valor y su origen */
  protected readonly kpis = [
    { x: 18, icon: ICON_PATHS.leaf, value: 22, badge: 'badge-v' },
    { x: 97, icon: ICON_PATHS.cloud, value: 26, badge: 'badge-e' },
    { x: 176, icon: ICON_PATHS.layers, value: 20, badge: 'badge-e' },
  ];
  /** Huella: la fila de tarjetas de abajo */
  protected readonly columns = [8, 92, 176];
  /** Prácticas: las tres buenas prácticas */
  protected readonly practiceRows = [81, 109, 137];
  /** Prácticas: lo que vio MODIS año por año, en colores de cobertura */
  protected readonly coverTiles = ['#c9a27c', '#dcb651', '#8fcf7c', '#3d9a4f', '#8fcf7c'];
  /** Rentabilidad: las dos tarjetas del margen */
  protected readonly marginCards = [46, 110];
  /** Fertilización: los cuadros por ambiente sobre el lote */
  protected readonly zoneCells = ZONE_CELLS;
  /** Pasaporte: las tarjetas de la ficha de atrás */
  protected readonly backCards = [18, 70, 122];

  protected readonly description = computed(
    () => HELP_STEPS.find((item) => item.key === this.step())?.description ?? '',
  );

  /** los pasos que pasan adentro del popup del lote: llevan su encabezado y sus pestañas */
  protected readonly popup = computed(() => {
    const step = this.step();
    return step !== 'marcar' && step !== 'abrir';
  });

  protected readonly tabs = computed(() => {
    const tab = HELP_STEPS.find((item) => item.key === this.step())?.tab ?? 'satellite';
    return layoutTabs(tab);
  });

  /** la pestaña abierta, para ponerle el aro cuando el paso es abrirla */
  protected readonly activeTab = computed(() => this.tabs().find((tab) => tab.active)!);

  /**
   * los pasos que pasan en una pestaña que no es la de entrada: la mano toca primero la pestaña
   * y después lo que hay que tocar adentro (en la bitácora, también el evento)
   */
  protected readonly sequence = computed(() => SEQUENCE_STEPS.has(this.step()));

  /** dónde está y cómo se mueve la mano en cada paso */
  protected readonly hand = computed<HandPlacement>(() => {
    const tab = this.activeTab();
    const onTab: Point = [tab.x + tab.width - 12, 37];
    switch (this.step()) {
      case 'marcar':
        return { outer: 'hand s1-hand', inner: 'press s1-press', transform: null, style: null };
      case 'abrir':
        return tap([236, 56]);
      case 'satelite':
        return tap(onTab);
      // en los botones, la punta del dedo va en el margen de la derecha: el rótulo se lee entero
      case 'huella':
        return sequence([onTab, [151, 101]]);
      case 'practicas':
        // en el borde del aro, entre las dos respuestas: la mano no tapa ninguna ni elige por vos
        return sequence([onTab, [246, 106]]);
      case 'rentabilidad':
        return sequence([onTab, [206, 88]]);
      case 'fertilizacion':
        return sequence([onTab, [244, 85]]);
      case 'bitacora':
        // la punta alta en Confirmar: así la mano entera entra en el dibujo
        return sequence([onTab, [228, 99], [89, 152]]);
      case 'pasaporte':
        return { outer: 'hand s9-hand', inner: 'press s9-press', transform: null, style: null };
    }
  });

  protected url(name: string): string {
    return `url(#${this.uid}-${name})`;
  }

  protected id(name: string): string {
    return `${this.uid}-${name}`;
  }
}
