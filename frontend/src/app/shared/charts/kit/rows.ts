import { LinearScale, linearScale } from '../scale';
import { estimateTextWidth, maxLineWidth, wrapText } from './text';

/** tamaño del texto dentro del svg: nunca menos de 12 px */
export const FONT_SIZE = 12;
/** alto de una línea de texto */
export const LINE_HEIGHT = 15;
/** distancia del borde superior de una línea de texto a su línea de base */
export const BASELINE = 11;
/** grosor de las barras: fino, deja aire en la fila */
export const BAR_HEIGHT = 16;
/** por debajo de este ancho el rótulo pasa arriba de su barra */
export const STACK_BELOW = 480;

const MIN_PLOT_SPAN = 48;

export interface RowSpec {
  label: string;
  note?: string;
}

/** una fila con rótulo y barra. las coordenadas verticales parten de cero */
export interface RowBox {
  labelLines: string[];
  /** línea de base de cada línea del rótulo */
  labelYs: number[];
  note: string | null;
  noteY: number;
  /** borde superior de la barra */
  barY: number;
  top: number;
  height: number;
}

export interface RowsLayout {
  /** true si el rótulo va arriba de la barra (pantallas angostas) */
  stacked: boolean;
  /** x donde empieza el área de las barras */
  plotLeft: number;
  rows: RowBox[];
  height: number;
}

/**
 * reparte filas de rótulo más barra. en ancho normal el rótulo va en una columna a la
 * izquierda (hasta dos líneas); en angosto baja la barra debajo del rótulo para que el
 * texto no le coma el lugar al dato
 */
export function layoutRows(specs: readonly RowSpec[], width: number): RowsLayout {
  const stacked = width < STACK_BELOW;
  const labelMax = stacked ? width : Math.min(240, Math.max(96, width * 0.34)) - 14;
  const wrapped = specs.map((spec) => ({
    lines: wrapText(spec.label, labelMax, FONT_SIZE, 2, true),
    note: spec.note ? wrapText(spec.note, labelMax, FONT_SIZE, 1)[0] : null,
  }));
  const plotLeft = stacked
    ? 0
    : Math.ceil(
        wrapped.reduce(
          (max, row) =>
            Math.max(
              max,
              maxLineWidth(row.lines, FONT_SIZE, true),
              row.note ? estimateTextWidth(row.note, FONT_SIZE) : 0,
            ),
          0,
        ),
      ) + 14;

  const rows: RowBox[] = [];
  let y = 0;
  for (const row of wrapped) {
    const textHeight = (row.lines.length + (row.note ? 1 : 0)) * LINE_HEIGHT;
    let height: number;
    let textTop: number;
    let barY: number;
    if (stacked) {
      textTop = y;
      barY = y + textHeight + 3;
      height = textHeight + 3 + BAR_HEIGHT + 14;
    } else {
      height = Math.max(BAR_HEIGHT, textHeight) + 14;
      textTop = y + (height - textHeight) / 2;
      barY = y + (height - BAR_HEIGHT) / 2;
    }
    rows.push({
      labelLines: row.lines,
      labelYs: row.lines.map((_, index) => textTop + index * LINE_HEIGHT + BASELINE),
      note: row.note,
      noteY: textTop + row.lines.length * LINE_HEIGHT + BASELINE,
      barY,
      top: y,
      height,
    });
    y += height;
  }
  return { stacked, plotLeft, rows, height: y };
}

/** rótulo que acompaña el extremo de una barra y necesita lugar a un lado */
export interface EndLabel {
  /** valor del dominio donde termina la barra */
  value: number;
  /** ancho estimado del rótulo */
  width: number;
  /** hacia qué lado del extremo se escribe */
  side: 'start' | 'end';
}

/**
 * escala lineal cuyo rango se achica lo justo para que los rótulos de los extremos de
 * las barras entren entre `left` y `right` sin cortarse
 */
export function fitScale(
  domain: readonly [number, number],
  left: number,
  right: number,
  labels: readonly EndLabel[],
  gap = 6,
): LinearScale {
  let lo = left;
  let hi = right;
  let scale = linearScale(domain, [lo, hi], true);
  // achicar el rango mueve los extremos de las barras: unas pocas vueltas convergen
  for (let pass = 0; pass < 8; pass++) {
    let overflowStart = 0;
    let overflowEnd = 0;
    for (const label of labels) {
      const x = scale(label.value);
      if (label.side === 'end') {
        overflowEnd = Math.max(overflowEnd, x + gap + label.width - right);
      } else {
        overflowStart = Math.max(overflowStart, left - (x - gap - label.width));
      }
    }
    if (overflowStart < 0.5 && overflowEnd < 0.5) {
      break;
    }
    lo += Math.max(0, overflowStart);
    hi -= Math.max(0, overflowEnd);
    if (hi - lo < MIN_PLOT_SPAN) {
      // sin lugar para todo: se conserva un tramo mínimo de barras antes que los rótulos
      const middle = Math.min(
        right - MIN_PLOT_SPAN / 2,
        Math.max(left + MIN_PLOT_SPAN / 2, (lo + hi) / 2),
      );
      return linearScale(domain, [middle - MIN_PLOT_SPAN / 2, middle + MIN_PLOT_SPAN / 2], true);
    }
    scale = linearScale(domain, [lo, hi], true);
  }
  return scale;
}
