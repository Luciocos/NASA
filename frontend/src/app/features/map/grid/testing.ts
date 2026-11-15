import { CellSet, ReadonlyCellSet } from './cell-set';
import { Cell, GridVertex } from './hectare-grid';
import { isSingleRegion } from './regions';

/*
 * ayudas para las pruebas de la grilla: formas dibujadas con texto, regiones al azar con semilla
 * y un revisor de contornos que no depende del código del trazado. nada de esto se usa en la
 * aplicación
 */

const SIDES: readonly Cell[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * celdas a partir de un dibujo: cada fila es un texto y "#" es una celda pintada (cualquier otro
 * carácter, por costumbre ".", es una celda sin pintar). la última fila es j = 0 y el primer
 * carácter es i = 0, así el dibujo se lee con el norte arriba
 *
 * acepta una lista de filas o un solo texto de varias líneas, del que se ignoran la sangría y
 * las líneas vacías
 */
export function cellsFromArt(art: string | readonly string[]): CellSet {
  const rows =
    typeof art === 'string'
      ? art
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
      : art;
  const cells = new CellSet();
  rows.forEach((row, index) => {
    const j = rows.length - 1 - index;
    [...row].forEach((char, i) => {
      if (char === '#') cells.addAt(i, j);
    });
  });
  return cells;
}

/** claves "i,j" ordenadas, para comparar conjuntos de celdas con un mensaje de error legible */
export function sortedKeys(cells: Iterable<Cell>): string[] {
  return [...cells].map(([i, j]) => `${i},${j}`).sort();
}

/** generador de números al azar con semilla (mulberry32): cada corrida da la misma secuencia */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomRegionOptions {
  /** celdas a las que llega el crecimiento, antes del borrado */
  size: number;
  /**
   * de 0 a 1: con 0 crece desde cualquier celda (manchas compactas) y cerca de 1 crece casi
   * siempre desde las últimas (formas con brazos, que encierran huecos al cruzarse)
   */
  stringiness?: number;
  /** intentos de borrado, como fracción de size. cada borrado conserva una sola región */
  erosion?: number;
}

/**
 * región al azar de celdas unidas por un lado: crecimiento aleatorio desde [0, 0] y después
 * borrado de celdas al azar que no la partan. el borrado es lo que deja huecos y pellizcos
 */
export function randomRegion(random: () => number, options: RandomRegionOptions): CellSet {
  const { size, stringiness = 0, erosion = 0.3 } = options;
  const cells = new CellSet([[0, 0]]);
  const order: Cell[] = [[0, 0]];
  while (cells.size < size) {
    const recent = random() < stringiness;
    const from = recent
      ? order.length - 1 - Math.floor(random() * Math.min(3, order.length))
      : Math.floor(random() * order.length);
    const [i, j] = order[from];
    const [di, dj] = SIDES[Math.floor(random() * 4)];
    if (cells.addAt(i + di, j + dj)) order.push([i + di, j + dj]);
  }
  const attempts = Math.floor(size * erosion);
  for (let k = 0; k < attempts && cells.size > 1; k++) {
    const [i, j] = order[Math.floor(random() * order.length)];
    if (!cells.deleteAt(i, j)) continue;
    if (!isSingleRegion(cells)) cells.addAt(i, j);
  }
  return cells;
}

/**
 * vértices "pellizco": aquellos donde dos celdas pintadas se tocan solo en diagonal (las otras
 * dos celdas del vértice están sin pintar)
 */
export function pinchVertices(cells: ReadonlyCellSet): GridVertex[] {
  const pinches: GridVertex[] = [];
  cells.forEach((i, j) => {
    // cada pellizco se encuentra una vez, desde la celda de abajo
    if (cells.hasAt(i + 1, j + 1) && !cells.hasAt(i + 1, j) && !cells.hasAt(i, j + 1)) {
      pinches.push([i + 1, j + 1]);
    }
    if (cells.hasAt(i - 1, j + 1) && !cells.hasAt(i - 1, j) && !cells.hasAt(i, j + 1)) {
      pinches.push([i, j + 1]);
    }
  });
  return pinches;
}

/**
 * cantidad de zonas sin pintar que quedan encerradas, contando como unidas solo las celdas que
 * comparten un lado. es un cálculo independiente del trazado de contornos, para contrastarlo
 */
export function enclosedBackgroundCount(cells: ReadonlyCellSet): number {
  const box = cells.bounds();
  if (!box) return 0;
  // un margen de una celda alrededor de la caja deja todo el fondo de afuera unido
  const minI = box.minI - 1;
  const maxI = box.maxI + 1;
  const minJ = box.minJ - 1;
  const maxJ = box.maxJ + 1;
  const seen = new CellSet();
  const fill = (startI: number, startJ: number) => {
    seen.addAt(startI, startJ);
    const pending = [startI, startJ];
    while (pending.length > 0) {
      const j = pending.pop()!;
      const i = pending.pop()!;
      for (const [di, dj] of SIDES) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < minI || ni > maxI || nj < minJ || nj > maxJ) continue;
        if (!cells.hasAt(ni, nj) && seen.addAt(ni, nj)) pending.push(ni, nj);
      }
    }
  };
  fill(minI, minJ);
  let enclosed = 0;
  for (let j = minJ; j <= maxJ; j++) {
    for (let i = minI; i <= maxI; i++) {
      if (cells.hasAt(i, j) || seen.hasAt(i, j)) continue;
      fill(i, j);
      enclosed++;
    }
  }
  return enclosed;
}

/**
 * todos los vértices de la grilla por los que pasa un anillo, de a un paso de celda. el anillo
 * viene solo con sus esquinas, como lo devuelve traceRings
 *
 * @throws Error si algún tramo no es horizontal ni vertical
 */
export function ringSteps(ring: readonly GridVertex[]): GridVertex[] {
  const steps: GridVertex[] = [];
  ring.forEach(([x1, y1], k) => {
    const [x2, y2] = ring[(k + 1) % ring.length];
    if (x1 !== x2 && y1 !== y2) throw new Error(`tramo en diagonal: ${x1},${y1} a ${x2},${y2}`);
    const length = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    const stepX = Math.sign(x2 - x1);
    const stepY = Math.sign(y2 - y1);
    for (let n = 0; n < length; n++) steps.push([x1 + n * stepX, y1 + n * stepY]);
  });
  return steps;
}

/** contornos tal como los devuelve traceRings */
interface Rings {
  exterior: GridVertex[];
  holes: GridVertex[][];
}

/**
 * revisa, sin usar el código del trazado, que unos contornos cumplan todo lo que se le pide a
 * traceRings. devuelve la lista de problemas encontrados: vacía si está todo bien
 */
export function ringProblems(cells: ReadonlyCellSet, traced: Rings): string[] {
  const rings = [traced.exterior, ...traced.holes];
  if (rings.some((ring) => ring.length < 4)) return ['hay un anillo con menos de 4 vértices'];
  return [
    ...orientationProblems(cells, traced),
    ...rings.flatMap((ring, n) => cornerProblems(ring, n)),
    ...borderProblems(cells, rings),
    ...canonicalFormProblems(traced),
  ];
}

function signedArea(ring: readonly GridVertex[]): number {
  return ring.reduce((sum, [x1, y1], k) => {
    const [x2, y2] = ring[(k + 1) % ring.length];
    return sum + (x1 * y2 - x2 * y1) / 2;
  }, 0);
}

// exterior antihorario, huecos horarios, y entre todos encierran tantas unidades como celdas hay
function orientationProblems(cells: ReadonlyCellSet, traced: Rings): string[] {
  const problems: string[] = [];
  if (!(signedArea(traced.exterior) > 0)) {
    problems.push('el exterior no gira en sentido antihorario');
  }
  traced.holes.forEach((hole, n) => {
    if (!(signedArea(hole) < 0)) problems.push(`el hueco ${n} no gira en sentido horario`);
  });
  const net = [traced.exterior, ...traced.holes].reduce((sum, ring) => sum + signedArea(ring), 0);
  if (net !== cells.size) problems.push(`superficie ${net} con ${cells.size} celdas`);
  const enclosed = enclosedBackgroundCount(cells);
  if (traced.holes.length !== enclosed) {
    problems.push(`${traced.holes.length} huecos trazados, ${enclosed} zonas encerradas`);
  }
  return problems;
}

// en cada vértice el contorno tiene que doblar: entra por un eje y sale por el otro. así no hay
// vértices alineados ni tramos en diagonal
function cornerProblems(ring: readonly GridVertex[], n: number): string[] {
  const problems: string[] = [];
  ring.forEach(([x, y], k) => {
    const [px, py] = ring[(k + ring.length - 1) % ring.length];
    const [nx, ny] = ring[(k + 1) % ring.length];
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      problems.push(`vértice no entero ${x},${y} en el anillo ${n}`);
    }
    const inHorizontal = py === y && px !== x;
    const inVertical = px === x && py !== y;
    const outHorizontal = ny === y && nx !== x;
    const outVertical = nx === x && ny !== y;
    if (!((inHorizontal && outVertical) || (inVertical && outHorizontal))) {
      problems.push(`el anillo ${n} no dobla en ${x},${y}`);
    }
  });
  return problems;
}

// celda que queda a la izquierda de un paso que sale del vértice [x, y] con rumbo [dx, dy]
function leftCell(x: number, y: number, dx: number, dy: number): Cell {
  if (dx === 1) return [x, y];
  if (dx === -1) return [x - 1, y - 1];
  return dy === 1 ? [x - 1, y] : [x, y - 1];
}

// celda que queda a la derecha del mismo paso
function rightCell(x: number, y: number, dx: number, dy: number): Cell {
  if (dx === 1) return [x, y - 1];
  if (dx === -1) return [x - 1, y];
  return dy === 1 ? [x, y] : [x - 1, y - 1];
}

// los anillos, paso a paso: cada paso es un lado del borde con lo pintado a la izquierda, entre
// todos recorren cada lado una sola vez, ninguno pasa dos veces por el mismo punto y dos anillos
// solo se tocan en un pellizco
function borderProblems(cells: ReadonlyCellSet, rings: readonly GridVertex[][]): string[] {
  const problems: string[] = [];
  const visits = new Map<string, number[]>();
  const edges = new Set<string>();
  rings.forEach((ring, n) => {
    const steps = ringSteps(ring);
    steps.forEach(([x, y], k) => {
      const key = `${x},${y}`;
      const seen = visits.get(key) ?? [];
      if (seen.includes(n)) problems.push(`el anillo ${n} pasa dos veces por ${key}`);
      visits.set(key, [...seen, n]);

      const [nx, ny] = steps[(k + 1) % steps.length];
      const left = leftCell(x, y, nx - x, ny - y);
      const right = rightCell(x, y, nx - x, ny - y);
      if (!cells.has(left) || cells.has(right)) {
        problems.push(`el paso de ${key} a ${nx},${ny} del anillo ${n} no bordea lo pintado`);
      }
      const edge = `${key}>${nx},${ny}`;
      if (edges.has(edge)) problems.push(`el borde ${edge} aparece dos veces`);
      edges.add(edge);
    });
  });

  let borderSides = 0;
  cells.forEach((i, j) => {
    for (const [di, dj] of SIDES) if (!cells.hasAt(i + di, j + dj)) borderSides++;
  });
  if (edges.size !== borderSides) problems.push(`${edges.size} pasos para ${borderSides} lados`);

  const pinches = new Set(pinchVertices(cells).map(([x, y]) => `${x},${y}`));
  for (const [key, seen] of visits) {
    if (seen.length > 1 && !pinches.has(key)) problems.push(`anillos que se tocan en ${key}`);
  }
  for (const key of pinches) {
    const seen = visits.get(key) ?? [];
    if (seen.length !== 2 || seen[0] === seen[1]) {
      problems.push(`por el pellizco ${key} pasan los anillos [${seen.join(', ')}]`);
    }
  }
  return problems;
}

function isBefore(a: GridVertex, b: GridVertex): boolean {
  return a[1] < b[1] || (a[1] === b[1] && a[0] < b[0]);
}

// cada anillo arranca en su vértice más bajo (y más a la izquierda) y los huecos vienen ordenados
// por ese vértice: así el resultado no depende del orden en que se pintó
function canonicalFormProblems(traced: Rings): string[] {
  const problems: string[] = [];
  [traced.exterior, ...traced.holes].forEach((ring, n) => {
    if (ring.some((vertex) => isBefore(vertex, ring[0]))) {
      problems.push(`el anillo ${n} no arranca en su vértice más bajo`);
    }
  });
  traced.holes.forEach((hole, n) => {
    if (n > 0 && isBefore(hole[0], traced.holes[n - 1][0])) {
      problems.push(`los huecos ${n - 1} y ${n} están desordenados`);
    }
  });
  return problems;
}
