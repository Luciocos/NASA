/**
 * color de la capa NDVI de la maqueta: de suelo (NDVI bajo) a verde intenso (NDVI alto). los
 * cortes son solo para dibujar, no clasifican el cultivo: la pantalla muestra además el valor
 */
const STOPS: readonly (readonly [number, readonly [number, number, number]])[] = [
  [0, [168, 135, 95]],
  [0.25, [214, 196, 112]],
  [0.45, [156, 201, 90]],
  [0.65, [79, 154, 63]],
  [0.85, [31, 107, 44]],
];

/** color hex para un NDVI; los valores fuera de rango se recortan al primero o al último */
export function ndviTint(value: number): string {
  if (value <= STOPS[0][0]) return hex(STOPS[0][1]);
  for (let i = 1; i < STOPS.length; i++) {
    const [to, toColor] = STOPS[i];
    if (value <= to) {
      const [from, fromColor] = STOPS[i - 1];
      const t = (value - from) / (to - from);
      return hex([0, 1, 2].map((k) => fromColor[k] + (toColor[k] - fromColor[k]) * t));
    }
  }
  return hex(STOPS[STOPS.length - 1][1]);
}

/** paradas para dibujar la leyenda como degradado css */
export const NDVI_LEGEND_GRADIENT = `linear-gradient(90deg, ${STOPS.map(
  ([value, color]) => `${hex(color)} ${Math.round((value / 0.85) * 100)}%`,
).join(', ')})`;

function hex(rgb: readonly number[]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}
