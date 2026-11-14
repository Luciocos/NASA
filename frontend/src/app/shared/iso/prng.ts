/**
 * números pseudoaleatorios deterministas para las texturas: el mismo lote se dibuja igual en
 * cada cuadro, en cada sesión y en cada dispositivo
 */

/** hash fnv-1a de 32 bits de un texto. sirve de semilla a partir del id de un lote */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * generador mulberry32: devuelve una función que entrega números en [0, 1) siempre en la misma
 * secuencia para la misma semilla
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * número en [0, 1) que depende solo de la semilla y de dos índices enteros. no guarda estado:
 * sirve para variar cada planta de una hilera sin recorrer una secuencia
 */
export function hash2(seed: number, i: number, j: number): number {
  let h = (seed ^ Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
