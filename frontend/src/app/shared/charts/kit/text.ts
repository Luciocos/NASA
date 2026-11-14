// anchos aproximados en em de una tipografía sans del sistema. van algo holgados a
// propósito: la estimación solo reserva lugar y decide si dos rótulos chocan, así que
// conviene que sobre espacio antes que un texto quede cortado. se estima en vez de medir
// porque el dibujo tiene que salir igual sin navegador (pruebas en jsdom)
const NARROW = new Set([...'iljtfrI.,:;|!\'()[] ']);
const WIDE = new Set([...'mwMW%@']);
const UPPER = /[A-ZÁÉÍÓÚÑÜ]/;
const DIGIT = /[0-9±+\-−=<>~]/;

function charWidth(char: string): number {
  if (NARROW.has(char)) {
    return 0.34;
  }
  if (WIDE.has(char)) {
    return 0.88;
  }
  if (DIGIT.test(char)) {
    return 0.62;
  }
  if (UPPER.test(char)) {
    return 0.7;
  }
  return 0.57;
}

/** ancho estimado en píxeles de un texto de una línea */
export function estimateTextWidth(text: string, fontSize = 12, bold = false): number {
  let em = 0;
  for (const char of text) {
    em += charWidth(char);
  }
  return em * fontSize * (bold ? 1.06 : 1);
}

function truncate(text: string, maxWidth: number, fontSize: number, bold: boolean): string {
  let cut = text;
  while (cut.length > 1 && estimateTextWidth(`${cut}…`, fontSize, bold) > maxWidth) {
    cut = cut.slice(0, -1).trimEnd();
  }
  return `${cut}…`;
}

/**
 * parte un texto en líneas que entran en `maxWidth`, cortando por palabras. lo que no
 * entra en `maxLines` se abrevia con puntos suspensivos (el texto completo tiene que
 * quedar disponible por otra vía: la tabla de datos o el aria-label)
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize = 12,
  maxLines = 2,
  bold = false,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }
  const fits = (candidate: string) => estimateTextWidth(candidate, fontSize, bold) <= maxWidth;
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || fits(candidate)) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);

  const kept = lines.slice(0, Math.max(1, maxLines));
  if (lines.length > kept.length) {
    // junta lo que sobró en la última línea para que el corte muestre que el texto sigue
    kept[kept.length - 1] = truncate(
      lines.slice(kept.length - 1).join(' '),
      maxWidth,
      fontSize,
      bold,
    );
  }
  return kept.map((line) => (fits(line) ? line : truncate(line, maxWidth, fontSize, bold)));
}

/** ancho estimado de la línea más larga de un bloque de texto */
export function maxLineWidth(lines: readonly string[], fontSize = 12, bold = false): number {
  return lines.reduce((max, line) => Math.max(max, estimateTextWidth(line, fontSize, bold)), 0);
}
