import { IsoCamera, IsoRing, IsoRotation, IsoScreenPoint, IsoViewport } from './model';

/** zoom mínimo y máximo de la cámara, en px por metro */
export const ISO_MIN_ZOOM = 0.002;
export const ISO_MAX_ZOOM = 12;

// la cámara mira el suelo con 30° de elevación: el seno aplasta el suelo 2:1 (la proyección
// dimétrica clásica) y el coseno dice cuánto se ve de cada metro de altura
const GROUND_SQUASH = 0.5;
const HEIGHT_SCALE = Math.sqrt(3) / 2;

/**
 * px que mide en pantalla un metro recorrido sobre un eje del suelo (este o norte), por cada
 * px por metro de zoom. es lo que mide el lado de un recuadro de la cuadrícula
 */
export const ISO_AXIS_SCALE = Math.sqrt(5 / 8);

const QUARTER_COS = [1, 0, -1, 0] as const;
const QUARTER_SIN = [0, 1, 0, -1] as const;

/**
 * transformación afín del suelo a la pantalla, más el factor de altura:
 * `sx = a·x + c·y + e` y `sy = b·x + d·y + f − zs·z`
 *
 * el motor la calcula una vez por cuadro para no repetir trigonometría por cada vértice
 */
export interface IsoMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  zs: number;
}

export function createMatrix(): IsoMatrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, zs: 1 };
}

/**
 * matriz de una cámara. `spin` suma una fracción de cuarto de vuelta a `camera.rotation`: solo
 * se usa mientras se anima un giro
 */
export function cameraMatrix(
  camera: IsoCamera,
  viewport: IsoViewport,
  spin = 0,
  out: IsoMatrix = createMatrix(),
): IsoMatrix {
  let cos: number;
  let sin: number;
  if (spin === 0) {
    // valores exactos: con un giro entero no tiene que quedar error de coma flotante
    cos = QUARTER_COS[camera.rotation];
    sin = QUARTER_SIN[camera.rotation];
  } else {
    const angle = (camera.rotation + spin) * (Math.PI / 2);
    cos = Math.cos(angle);
    sin = Math.sin(angle);
  }
  const k = camera.zoom * Math.SQRT1_2;
  out.a = k * (cos + sin);
  out.c = k * (cos - sin);
  out.b = k * GROUND_SQUASH * (cos - sin);
  out.d = -k * GROUND_SQUASH * (cos + sin);
  out.e = viewport.width / 2 - out.a * camera.centerX - out.c * camera.centerY;
  out.f = viewport.height / 2 - out.b * camera.centerX - out.d * camera.centerY;
  out.zs = camera.zoom * HEIGHT_SCALE;
  return out;
}

const scratch = createMatrix();

/**
 * de metros locales a px de pantalla. `z` es la altura sobre el suelo, en metros
 *
 * @example
 * const { sx, sy } = project(camera, { width: 800, height: 600 }, 120, 340);
 */
export function project(
  camera: IsoCamera,
  viewport: IsoViewport,
  x: number,
  y: number,
  z = 0,
): IsoScreenPoint {
  const m = cameraMatrix(camera, viewport, 0, scratch);
  return { sx: m.a * x + m.c * y + m.e, sy: m.b * x + m.d * y + m.f - m.zs * z };
}

/**
 * de px de pantalla a metros locales, sobre el plano horizontal de altura `z` (el suelo si se
 * omite). es la inversa exacta de project para esa altura
 */
export function unproject(
  camera: IsoCamera,
  viewport: IsoViewport,
  sx: number,
  sy: number,
  z = 0,
): { x: number; y: number } {
  const m = cameraMatrix(camera, viewport, 0, scratch);
  const u = sx - m.e;
  const v = sy - m.f + m.zs * z;
  const det = m.a * m.d - m.b * m.c;
  return { x: (m.d * u - m.c * v) / det, y: (m.a * v - m.b * u) / det };
}

/**
 * profundidad de un punto del suelo para el algoritmo del pintor: metros hacia el observador,
 * medidos desde el centro de la cámara. se dibuja primero lo de menor profundidad
 */
export function depth(camera: IsoCamera, x: number, y: number): number {
  const cos = QUARTER_COS[camera.rotation];
  const sin = QUARTER_SIN[camera.rotation];
  const dx = x - camera.centerX;
  const dy = y - camera.centerY;
  return dx * (cos - sin) - dy * (cos + sin);
}

/** margen libre alrededor de lo que se encuadra, en px */
export interface IsoPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// con una vista muy chica los márgenes no pueden comerse todo el lugar
const MIN_FREE_FRACTION = 0.4;

/**
 * cámara que encuadra todos los anillos dentro de la vista, dejando `padding` px libres
 *
 * devuelve null si no hay puntos o si la vista no tiene tamaño
 */
export function fitCamera(
  rings: Iterable<IsoRing>,
  viewport: IsoViewport,
  rotation: IsoRotation,
  padding: number | IsoPadding = 48,
  maxZoom = ISO_MAX_ZOOM,
): IsoCamera | null {
  const { width, height } = viewport;
  if (!(width > 0 && height > 0)) return null;

  const cos = QUARTER_COS[rotation];
  const sin = QUARTER_SIN[rotation];
  const a = Math.SQRT1_2 * (cos + sin);
  const c = Math.SQRT1_2 * (cos - sin);
  const b = GROUND_SQUASH * c;
  const d = -GROUND_SQUASH * a;

  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      const u = a * x + c * y;
      const v = b * x + d * y;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  if (minU > maxU) return null;

  const pad =
    typeof padding === 'number'
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : padding;
  const shrinkX = Math.min(1, (width * (1 - MIN_FREE_FRACTION)) / (pad.left + pad.right || 1));
  const shrinkY = Math.min(1, (height * (1 - MIN_FREE_FRACTION)) / (pad.top + pad.bottom || 1));
  const left = pad.left * shrinkX;
  const right = pad.right * shrinkX;
  const top = pad.top * shrinkY;
  const bottom = pad.bottom * shrinkY;

  let zoom = Math.min(
    (width - left - right) / (maxU - minU),
    (height - top - bottom) / (maxV - minV),
  );
  // un solo punto no tiene tamaño: se acerca todo lo permitido
  if (!Number.isFinite(zoom)) zoom = maxZoom;
  zoom = Math.min(Math.max(zoom, ISO_MIN_ZOOM), maxZoom);

  // el centro de lo encuadrado tiene que caer en el centro del área libre, no de la vista
  const targetU = (minU + maxU) / 2 - (left - right) / 2 / zoom;
  const targetV = (minV + maxV) / 2 - (top - bottom) / 2 / zoom;
  const det = a * d - b * c;
  return {
    centerX: (d * targetU - c * targetV) / det,
    centerY: (a * targetV - b * targetU) / det,
    zoom,
    rotation,
  };
}

/**
 * cámara intermedia entre dos, para animar un encuadre: `t` va de 0 a 1. el zoom se interpola
 * en escala geométrica y el centro lo acompaña, así la imagen crece o se achica alrededor de
 * un punto fijo de la pantalla en lugar de derivar
 */
export function lerpCamera(from: IsoCamera, to: IsoCamera, t: number, out: IsoCamera): IsoCamera {
  const zoom = from.zoom * Math.pow(to.zoom / from.zoom, t);
  const w0 = 1 / from.zoom;
  const w1 = 1 / to.zoom;
  const s = Math.abs(w1 - w0) < 1e-9 * w0 ? t : (1 / zoom - w0) / (w1 - w0);
  out.centerX = from.centerX + (to.centerX - from.centerX) * s;
  out.centerY = from.centerY + (to.centerY - from.centerY) * s;
  out.zoom = zoom;
  out.rotation = to.rotation;
  return out;
}

/** barra de escala: un largo "redondo" en metros y lo que mide en pantalla */
export interface IsoScaleBar {
  meters: number;
  /** largo en px, medido sobre un eje del suelo (la dirección de las líneas de la cuadrícula) */
  px: number;
  /** texto para mostrar, por ejemplo "250 m" o "2,5 km" */
  label: string;
}

const SCALE_STEPS = [
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000,
];

/**
 * mayor largo redondo cuya barra entra en `maxPx`. la barra se dibuja paralela a las líneas de
 * la cuadrícula, que es la única dirección en la que una medida de la maqueta es directa
 */
export function scaleBar(zoom: number, maxPx = 110): IsoScaleBar {
  const pxPerMeter = zoom * ISO_AXIS_SCALE;
  let meters = SCALE_STEPS[0];
  for (const step of SCALE_STEPS) {
    if (step * pxPerMeter <= maxPx) meters = step;
  }
  const label = meters >= 1000 ? `${(meters / 1000).toLocaleString('es-AR')} km` : `${meters} m`;
  return { meters, px: meters * pxPerMeter, label };
}
