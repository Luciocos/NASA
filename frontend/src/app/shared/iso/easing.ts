/** curvas de animación del motor: reciben y devuelven un avance entre 0 y 1 */

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** arranca rápido y frena suave: movimientos de cámara */
export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

/** acelera y frena: giros de cámara */
export function easeInOutCubic(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** se pasa un poco del final y vuelve: el rebote con el que un lote sube desde el suelo */
export function easeOutBack(t: number): number {
  const u = clamp01(t) - 1;
  const overshoot = 1.9;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}
