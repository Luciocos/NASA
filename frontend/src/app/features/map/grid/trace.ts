import { ringSignedArea } from '../../../core/geo/local-frame';
import { ReadonlyCellSet } from './cell-set';
import { GridVertex } from './hectare-grid';
import { isSingleRegion } from './regions';

/** por qué un conjunto de celdas no se puede guardar como un solo polígono */
export type GridShapeProblem = 'empty' | 'multiple-regions';

const PROBLEM_MESSAGES: Record<GridShapeProblem, string> = {
  empty: 'No squares painted.',
  'multiple-regions':
    'The painted squares form more than one block: they must be joined along a side.',
};

/**
 * error de traceRings y cellsToGeometry cuando las celdas no forman exactamente una región
 *
 * `problem` permite elegir el texto de la interfaz. `message` trae uno listo para mostrar
 */
export class GridShapeError extends Error {
  constructor(readonly problem: GridShapeProblem) {
    super(PROBLEM_MESSAGES[problem]);
    this.name = 'GridShapeError';
  }
}

/** contornos de una región, sobre los vértices de la grilla */
export interface TracedRings {
  /** contorno de afuera, en sentido antihorario */
  exterior: GridVertex[];
  /** un anillo por hueco, en sentido horario */
  holes: GridVertex[][];
}

// rumbos: 0 este, 1 norte, 2 oeste, 3 sur. girar a la izquierda suma 1 y girar a la derecha suma 3
const STEP_X = [1, 0, -1, 0];
const STEP_Y = [0, 1, 0, -1];
// celda que queda adelante a la izquierda al pasar por un vértice con cada rumbo, como
// desplazamiento desde el vértice. es también la celda que el tramo que sale deja a su izquierda.
// la de adelante a la derecha es la misma tabla con el rumbo girado a la derecha
const AHEAD_LEFT_I = [0, -1, -1, 0];
const AHEAD_LEFT_J = [0, 0, -1, -1];

/**
 * contornos de una sola región de celdas unidas por un lado, listos para armar un polígono válido
 *
 * - el exterior va en sentido antihorario y los huecos en sentido horario (rfc 7946)
 * - los huecos son las zonas sin pintar que quedan encerradas. dos zonas sin pintar que se tocan
 *   solo en diagonal son huecos distintos
 * - ningún anillo repite un vértice ni pasa dos veces por el mismo punto, que es lo que exige
 *   shapely. un anillo puede tocar a otro en un punto, y eso es válido
 * - no hay vértices alineados y el primero no se repite al final
 * - el resultado no depende del orden en que se pintaron las celdas: cada anillo arranca en su
 *   vértice más bajo (y más a la izquierda si hay varios) y los huecos salen ordenados igual
 *
 * @example
 * // la región tiene que ser una sola: con varias, trazar cada una por separado
 * const outlines = components(cells).map((region) => traceRings(region));
 *
 * @throws GridShapeError si no hay celdas o si forman más de una región
 */
export function traceRings(cells: ReadonlyCellSet): TracedRings {
  if (cells.size === 0) throw new GridShapeError('empty');
  if (!isSingleRegion(cells)) throw new GridShapeError('multiple-regions');

  const box = cells.bounds()!;
  const stride = box.maxI - box.minI + 2;
  const edgeKey = (x: number, y: number, heading: number) =>
    ((y - box.minJ) * stride + (x - box.minI)) * 4 + heading;
  const visited = new Set<number>();

  let exterior: GridVertex[] = [];
  const holes: GridVertex[][] = [];
  cells.forEach((i, j) => {
    for (let heading = 0; heading < 4; heading++) {
      // tramo del borde de esta celda que la deja a su izquierda
      const x = i - AHEAD_LEFT_I[heading];
      const y = j - AHEAD_LEFT_J[heading];
      const right = (heading + 3) % 4;
      const isBorder = !cells.hasAt(x + AHEAD_LEFT_I[right], y + AHEAD_LEFT_J[right]);
      if (!isBorder || visited.has(edgeKey(x, y, heading))) continue;
      const ring = startAtLowestVertex(walkRing(cells, x, y, heading, visited, edgeKey));
      // con lo pintado a la izquierda, el contorno de afuera gira en sentido antihorario
      // (superficie positiva) y el de cada hueco en sentido horario
      if (ringSignedArea(ring) > 0) exterior = ring;
      else holes.push(ring);
    }
  });
  holes.sort((a, b) => a[0][1] - b[0][1] || a[0][0] - b[0][0]);
  return { exterior, holes };
}

/*
 * recorre un contorno completo dejando siempre lo pintado a la izquierda, y devuelve solo los
 * vértices donde dobla
 *
 * al llegar a un vértice mira las dos celdas de adelante. si la de la derecha está pintada, dobla
 * a la derecha, aunque la de la izquierda no lo esté. ese último caso es el "pellizco": dos
 * celdas pintadas que se tocan solo en diagonal. doblar a la derecha ahí es abrazar la celda sin
 * pintar en vez de seguir de largo por la pintada, y así el recorrido nunca cambia de zona sin
 * pintar: cada anillo es el borde de una sola zona. como la región pintada está unida por lados,
 * las dos celdas sin pintar de un pellizco son siempre de zonas distintas (el camino pintado que
 * une las dos celdas del pellizco las separa), así que cada anillo pasa una sola vez por el
 * vértice. doblando para el otro lado el anillo se tocaría a sí mismo y shapely lo rechazaría
 */
function walkRing(
  cells: ReadonlyCellSet,
  startX: number,
  startY: number,
  startHeading: number,
  visited: Set<number>,
  edgeKey: (x: number, y: number, heading: number) => number,
): GridVertex[] {
  const ring: GridVertex[] = [];
  let x = startX;
  let y = startY;
  let heading = startHeading;
  do {
    visited.add(edgeKey(x, y, heading));
    x += STEP_X[heading];
    y += STEP_Y[heading];
    const right = (heading + 3) % 4;
    let next: number;
    if (cells.hasAt(x + AHEAD_LEFT_I[right], y + AHEAD_LEFT_J[right])) {
      next = right;
    } else if (cells.hasAt(x + AHEAD_LEFT_I[heading], y + AHEAD_LEFT_J[heading])) {
      next = heading;
    } else {
      next = (heading + 1) % 4;
    }
    if (next !== heading) ring.push([x, y]);
    heading = next;
  } while (x !== startX || y !== startY || heading !== startHeading);
  return ring;
}

function startAtLowestVertex(ring: GridVertex[]): GridVertex[] {
  let start = 0;
  for (let k = 1; k < ring.length; k++) {
    const [x, y] = ring[k];
    const [bestX, bestY] = ring[start];
    if (y < bestY || (y === bestY && x < bestX)) start = k;
  }
  return [...ring.slice(start), ...ring.slice(0, start)];
}
