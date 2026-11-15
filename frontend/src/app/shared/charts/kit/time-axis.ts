import { LinearScale, dayToIso, isoToDay, timeTicks } from '../scale';
import { FONT_SIZE } from './rows';
import { estimateTextWidth } from './text';

/** línea de grilla de un eje de tiempo, en el primer día de un mes, trimestre o año */
export interface AxisLine {
  key: string;
  x: number;
  major: boolean;
}

/** rótulo ya ubicado de un eje de tiempo */
export interface AxisLabel {
  key: string;
  x: number;
  text: string;
  major: boolean;
}

export interface TimeAxis {
  lines: AxisLine[];
  labels: AxisLabel[];
}

/**
 * eje de tiempo sobre una escala lineal de días (isoToDay). la cantidad de marcas sale del
 * espacio disponible, así los rótulos no se pisan. cuando la unidad es el año, el rótulo
 * va centrado en el tramo de cada año (también en el año que empieza antes del dominio) y
 * la línea marca el 1 de enero. el rótulo que se saldría del dibujo se omite
 */
export function timeAxis(scale: LinearScale, width: number, minSpacing = 64): TimeAxis {
  const [d0, d1] = scale.domain;
  const span = Math.abs(scale.range[1] - scale.range[0]);
  const count = Math.max(2, Math.floor(span / minSpacing));
  const { unit, step, ticks } = timeTicks(dayToIso(Math.ceil(d0)), dayToIso(Math.floor(d1)), count);
  const lines = ticks.map((tick) => ({
    key: tick.date,
    x: scale(isoToDay(tick.date)),
    major: tick.major,
  }));
  const fits = (x: number, text: string, room = Infinity) => {
    const textWidth = estimateTextWidth(text, FONT_SIZE);
    return x - textWidth / 2 >= 0 && x + textWidth / 2 <= width && textWidth + 8 <= room;
  };

  if (unit === 'year' && step === 1) {
    const labels: AxisLabel[] = [];
    const first = Number(dayToIso(Math.ceil(d0)).slice(0, 4));
    const last = Number(dayToIso(Math.floor(d1)).slice(0, 4));
    for (let year = first; year <= last; year++) {
      const from = scale(Math.max(d0, isoToDay(`${year}-01-01`)));
      const to = scale(Math.min(d1, isoToDay(`${year + 1}-01-01`)));
      const x = (from + to) / 2;
      const text = String(year);
      if (fits(x, text, Math.abs(to - from))) {
        labels.push({ key: text, x, text, major: true });
      }
    }
    return { lines, labels };
  }

  const labels = ticks
    .map((tick, index) => ({
      key: tick.date,
      x: lines[index].x,
      text: tick.label,
      major: tick.major,
    }))
    .filter((label) => fits(label.x, label.text));
  return { lines, labels };
}

/** fecha de hoy AAAA-MM-DD según el reloj local */
export function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
