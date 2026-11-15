import { Crop, EventType } from '../../core/models';

/** punto en metros locales: [x hacia el este, y hacia el norte] */
export type IsoPoint = readonly [number, number];

/** anillo de un polígono en metros locales, sin repetir el primer punto al final */
export type IsoRing = readonly IsoPoint[];

/**
 * textura ilustrativa de la cara superior de un lote
 *
 * es un dibujo del último estado registrado, no una observación: las hileras y las plantas son
 * decorativas y no representan densidad, altura ni ningún otro dato medido
 */
export type IsoCover =
  'bare' | 'tilled' | 'sown' | 'crop' | 'cover' | 'stubble' | 'flooded' | 'burnt' | 'unknown';

/** todas las texturas, en el orden en que conviene listarlas en una leyenda */
export const ISO_COVERS: readonly IsoCover[] = [
  'bare',
  'tilled',
  'sown',
  'crop',
  'cover',
  'stubble',
  'flooded',
  'burnt',
  'unknown',
];

/** glifo de un marcador: un tipo de evento, PENDING (lote sin sincronizar) o NO_DATA */
export type IsoGlyph = EventType | 'PENDING' | 'NO_DATA';

/**
 * origen del dato que muestra un marcador. se dibuja en el borde del globo y nunca solo con
 * color: verified línea llena, declared doble línea, estimated punteada, neutral línea fina
 */
export type IsoTone = 'verified' | 'declared' | 'estimated' | 'neutral';

/** globo que flota sobre el lote con el glifo de su último evento */
export interface IsoMarker {
  glyph: IsoGlyph;
  tone: IsoTone;
  /** dato simulado para la demostración: suma un contorno discontinuo alrededor del globo */
  simulated?: boolean;
}

/**
 * estado de un lote en la maqueta
 *
 * - normal: guardado en el backend
 * - pending: guardado solo en el dispositivo, sin sincronizar (borde punteado y translúcido)
 * - draft: en edición (borde ámbar y cuadrícula de plano de obra)
 */
export type IsoLotStatus = 'normal' | 'pending' | 'draft';

/** lote tal como lo dibuja la maqueta isométrica */
export interface IsoLot {
  /** identificador estable: de él salen la animación de entrada y la semilla de la textura */
  id: string;
  /** nombre del lote, para el rótulo */
  label: string;
  /** segundo dato del rótulo, por ejemplo "86,7 ha". se muestra solo si hay lugar */
  sublabel?: string;
  /**
   * polígono en metros locales: [exterior, ...huecos]. el sentido de giro no importa. para
   * cambiar la forma hay que pasar un array nuevo: la geometría se cachea por identidad
   */
  rings: readonly IsoRing[];
  /** textura ilustrativa de la cara superior */
  cover: IsoCover;
  /** elige el dibujo de planta cuando cover es 'crop' o 'sown' */
  crop?: Crop | null;
  /**
   * color de una capa de datos (coroplético) para la cara superior. tiene que ser un color que
   * el canvas entienda (hex, rgb(), hsl()...), no una variable css. null usa los colores del cover
   */
  tint?: string | null;
  /** trama diagonal de "sin dato" para la capa activa */
  hatched?: boolean;
  /** globo con el último evento, o null si no hay nada que marcar */
  marker?: IsoMarker | null;
  /** por defecto 'normal' */
  status?: IsoLotStatus;
}

/** cuartos de vuelta de la cámara. con 0 el norte queda hacia arriba a la derecha */
export type IsoRotation = 0 | 1 | 2 | 3;

/** cámara de la maqueta */
export interface IsoCamera {
  /** punto del suelo que queda en el centro de la vista, en metros locales */
  centerX: number;
  centerY: number;
  /** px por metro medidos sobre la horizontal de la pantalla */
  zoom: number;
  /**
   * cuartos de vuelta: cada uno gira el terreno 90° en sentido antihorario visto desde arriba,
   * así que el norte pasa de arriba a la derecha (0) a arriba a la izquierda (1), abajo a la
   * izquierda (2) y abajo a la derecha (3)
   */
  rotation: IsoRotation;
}

/** tamaño de la vista en px de css */
export interface IsoViewport {
  width: number;
  height: number;
}

/** punto de la pantalla en px de css, con el origen arriba a la izquierda */
export interface IsoScreenPoint {
  sx: number;
  sy: number;
}

/** lo que emite la escena cuando cambia la vista */
export interface IsoViewChange {
  zoom: number;
  rotation: IsoRotation;
}
