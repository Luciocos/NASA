/** forma de una marca puntual. `ring` es el círculo hueco */
export type MarkShape = 'circle' | 'diamond' | 'ring' | 'square' | 'triangle';

// dos decimales alcanzan para un trazo nítido y dejan el atributo corto
function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

/**
 * barra horizontal que va de la línea de base `x0` hasta el dato `x1`: solo se redondea el
 * extremo del dato, la base queda recta para que la barra apoye en su eje. sirve para los
 * dos sentidos (`x1` menor que `x0` dibuja hacia la izquierda)
 */
export function barPath(x0: number, x1: number, y: number, height: number, radius = 4): string {
  const direction = x1 >= x0 ? 1 : -1;
  const r = Math.min(radius, Math.abs(x1 - x0), height / 2);
  const sweep = direction === 1 ? 1 : 0;
  return [
    `M${n(x0)},${n(y)}`,
    `H${n(x1 - direction * r)}`,
    `A${n(r)},${n(r)} 0 0 ${sweep} ${n(x1)},${n(y + r)}`,
    `V${n(y + height - r)}`,
    `A${n(r)},${n(r)} 0 0 ${sweep} ${n(x1 - direction * r)},${n(y + height)}`,
    `H${n(x0)}`,
    'Z',
  ].join('');
}

/**
 * barra con el extremo del dato en punta: la forma, además del color y del signo, dice
 * hacia dónde va una variación
 */
export function arrowPath(x0: number, x1: number, y: number, height: number, tip = 7): string {
  const direction = x1 >= x0 ? 1 : -1;
  const t = Math.min(tip, Math.abs(x1 - x0));
  const shoulder = x1 - direction * t;
  return [
    `M${n(x0)},${n(y)}`,
    `H${n(shoulder)}`,
    `L${n(x1)},${n(y + height / 2)}`,
    `L${n(shoulder)},${n(y + height)}`,
    `H${n(x0)}`,
    'Z',
  ].join('');
}

/** rectángulo con radios distintos a izquierda y derecha (tramos de una barra apilada) */
export function segmentPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radiusLeft: number,
  radiusRight: number,
): string {
  const limit = Math.min(width / 2, height / 2);
  const rl = Math.max(0, Math.min(radiusLeft, limit));
  const rr = Math.max(0, Math.min(radiusRight, limit));
  return [
    `M${n(x + rl)},${n(y)}`,
    `H${n(x + width - rr)}`,
    `A${n(rr)},${n(rr)} 0 0 1 ${n(x + width)},${n(y + rr)}`,
    `V${n(y + height - rr)}`,
    `A${n(rr)},${n(rr)} 0 0 1 ${n(x + width - rr)},${n(y + height)}`,
    `H${n(x + rl)}`,
    `A${n(rl)},${n(rl)} 0 0 1 ${n(x)},${n(y + height - rl)}`,
    `V${n(y + rl)}`,
    `A${n(rl)},${n(rl)} 0 0 1 ${n(x + rl)},${n(y)}`,
    'Z',
  ].join('');
}

/** contorno de una marca centrada en el origen. `ring` usa el mismo círculo, sin relleno */
export function shapePath(shape: MarkShape, radius: number): string {
  const r = radius;
  switch (shape) {
    case 'diamond': {
      // la diagonal se agranda para que el rombo pese a la vista lo mismo que el círculo
      const d = r * 1.18;
      return `M0,${n(-d)}L${n(d)},0L0,${n(d)}L${n(-d)},0Z`;
    }
    case 'square': {
      const s = r * 0.88;
      return `M${n(-s)},${n(-s)}H${n(s)}V${n(s)}H${n(-s)}Z`;
    }
    case 'triangle': {
      const t = r * 1.15;
      return `M0,${n(-t)}L${n(t)},${n(t * 0.8)}L${n(-t)},${n(t * 0.8)}Z`;
    }
    default:
      return `M${n(-r)},0A${n(r)},${n(r)} 0 1 0 ${n(r)},0A${n(r)},${n(r)} 0 1 0 ${n(-r)},0Z`;
  }
}

/** punto sobre una circunferencia. el ángulo va en grados, desde las 12 y en sentido horario */
export function polarPoint(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

/** tramo de anillo entre dos ángulos (grados desde las 12, sentido horario) */
export function ringSegmentPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  // un tramo de 360 grados no se puede trazar con un solo arco: se recorta apenas
  const sweep = Math.min(end - start, 359.99);
  const stop = start + sweep;
  const large = sweep > 180 ? 1 : 0;
  const [x0, y0] = polarPoint(cx, cy, outer, start);
  const [x1, y1] = polarPoint(cx, cy, outer, stop);
  const [x2, y2] = polarPoint(cx, cy, inner, stop);
  const [x3, y3] = polarPoint(cx, cy, inner, start);
  return [
    `M${n(x0)},${n(y0)}`,
    `A${n(outer)},${n(outer)} 0 ${large} 1 ${n(x1)},${n(y1)}`,
    `L${n(x2)},${n(y2)}`,
    `A${n(inner)},${n(inner)} 0 ${large} 0 ${n(x3)},${n(y3)}`,
    'Z',
  ].join('');
}
