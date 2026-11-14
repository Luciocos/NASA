import { CellSet, ReadonlyCellSet } from './cell-set';

// los cuatro vecinos que comparten un lado con una celda
const SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * regiones de un conjunto de celdas: grupos de celdas unidas por un lado (dos celdas que se tocan
 * solo en diagonal quedan en regiones distintas)
 *
 * devuelve una región por grupo, de la más grande a la más chica. un conjunto vacío no tiene
 * regiones
 *
 * @example
 * const [largest, ...rest] = components(editor.cells);
 * if (rest.length > 0) editor.replaceAll(largest); // conservar solo el bloque más grande
 */
export function components(cells: ReadonlyCellSet): CellSet[] {
  const seen = new CellSet();
  const regions: CellSet[] = [];
  cells.forEach((i, j) => {
    if (seen.hasAt(i, j)) return;
    const region = flood(cells, i, j);
    region.forEach((ri, rj) => seen.addAt(ri, rj));
    regions.push(region);
  });
  // el orden de sort es estable: a igual tamaño queda primero la región que se pintó antes
  return regions.sort((a, b) => b.size - a.size);
}

/**
 * true si las celdas forman exactamente una región, o sea si se pueden guardar como un solo
 * polígono. un conjunto vacío da false
 */
export function isSingleRegion(cells: ReadonlyCellSet): boolean {
  const first = cells.values().next();
  if (first.done) return false;
  return flood(cells, first.value[0], first.value[1]).size === cells.size;
}

// región que contiene a la celda inicial. usa una pila propia en vez de recursión: una región de
// miles de celdas desbordaría la pila de llamadas
function flood(cells: ReadonlyCellSet, startI: number, startJ: number): CellSet {
  const region = new CellSet();
  region.addAt(startI, startJ);
  const pending = [startI, startJ];
  while (pending.length > 0) {
    const j = pending.pop()!;
    const i = pending.pop()!;
    for (const [di, dj] of SIDES) {
      const ni = i + di;
      const nj = j + dj;
      if (cells.hasAt(ni, nj) && region.addAt(ni, nj)) pending.push(ni, nj);
    }
  }
  return region;
}
