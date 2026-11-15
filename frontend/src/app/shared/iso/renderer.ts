import { clamp01, easeOutBack } from './easing';
import { pointInFlatRings, verticalSegmentCrossesFlatRings } from './geometry';
import { ISO_GLYPH_BOX, ISO_GLYPH_STROKE, isoGlyphPath } from './glyphs';
import { LotEntry, createEntry, prepareGeometry } from './lot-entry';
import { IsoCamera, IsoGlyph, IsoLot } from './model';
import { CoverStyle, PALETTE, TONE_COLORS, WallTones, alpha, coverStyle } from './palette';
import { IsoMatrix, cameraMatrix, createMatrix } from './projection';
import { PaintState, paintBlueprint, paintCover, paintHatch, paintTintRows } from './textures';

/** todo lo que el motor necesita para dibujar un cuadro */
export interface IsoFrame {
  /** lotes a dibujar. para cambiar la lista hay que pasar un array nuevo */
  lots: readonly IsoLot[];
  camera: IsoCamera;
  /** fracción de cuarto de vuelta que se suma a `camera.rotation` mientras se anima un giro */
  spin?: number;
  /** tamaño del canvas en px de css */
  width: number;
  height: number;
  /** px físicos por px de css. el canvas tiene que medir `width * dpr` por `height * dpr` */
  dpr: number;
  /** reloj en ms (performance.now): mueve las animaciones y el movimiento ambiente */
  time: number;
  selectedId?: string | null;
  hoverId?: string | null;
  /** por defecto true */
  showGrid?: boolean;
  /** lado de cada recuadro de la cuadrícula en metros. por defecto 100 (una hectárea) */
  gridSize?: number;
  /** true permite el movimiento ambiente (reflejo del agua, vaivén de los cultivos) */
  ambient?: boolean;
  /** true dibuja todo en su estado final, sin animaciones */
  reducedMotion?: boolean;
}

/** lo que el motor avisa después de cada cuadro. es siempre el mismo objeto */
export interface IsoFrameResult {
  /** hay una animación en curso: hay que pedir otro cuadro */
  animating: boolean;
  /** se dibujó algo que cambia con el tiempo: vale la pena seguir con el movimiento ambiente */
  ambient: boolean;
}

const RISE_MS = 520;
const ENTRY_MS = 660;
const STAGGER_MS = 45;
const MAX_STAGGER_MS = 540;
const MARKER_DELAY_MS = 300;
const MARKER_POP_MS = 320;
const LABEL_DELAY_MS = 420;
const LABEL_FADE_MS = 220;
const HOVER_LIFT = 3;
const SELECT_LIFT = 7;
const LIFT_TAU_MS = 70;
const PULSE_BEAT_MS = 650;
const PULSE_BEATS = 2;
const PLANT_BUDGET = 2600;

const SIMPLE_WALL_PX = 4.5;
const MICRO_SIZE = 9;
const TEXTURE_MIN_SIZE = 18;
const MARKER_MIN_SIZE = 20;
const MARKER_FULL_SIZE = 44;
const MARKER_RADIUS = 13;
const MARKER_RADIUS_SMALL = 10;
const LABEL_MIN_SIZE = 58;
const LABEL_HEIGHT = 22;
const LABEL_PAD = 9;
const LABEL_GAP = 7;
const LABEL_MAX_TEXT = 180;
const MAX_LABELS = 48;
const MAX_HANDLES = 48;

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const LABEL_FONT = `600 12px ${FONT_STACK}`;
const SUBLABEL_FONT = `500 11px ${FONT_STACK}`;

const NO_DASH: number[] = [];
const DASH_PENDING = [5, 4];
const DASH_DOTTED = [0.01, 3.6];
const DASH_SIMULATED = [4, 3];
const SHADOW_STEPS = [0.55, 0.85, 1.15];
const GRID_FADE_FROM = 4.5;
const GRID_FADE_SPAN = 9;

/** altura del bloque según su tamaño en pantalla: crece rápido al principio y después se aplana */
function blockHeight(size: number): number {
  return Math.min(size * 0.35, 2 + 20 * (1 - Math.exp(-size / 240)));
}

function topPath(ctx: CanvasRenderingContext2D, entry: LotEntry, lift: number): void {
  ctx.beginPath();
  for (const ring of entry.screen) {
    const n = ring.length;
    ctx.moveTo(ring[0], ring[1] - lift);
    for (let i = 2; i < n; i += 2) ctx.lineTo(ring[i], ring[i + 1] - lift);
    ctx.closePath();
  }
}

function addOffsetPath(ctx: CanvasRenderingContext2D, entry: LotEntry, ox: number, oy: number) {
  for (const ring of entry.screen) {
    const n = ring.length;
    ctx.moveTo(ring[0] + ox, ring[1] + oy);
    for (let i = 2; i < n; i += 2) ctx.lineTo(ring[i] + ox, ring[i + 1] + oy);
    ctx.closePath();
  }
}

/**
 * agrega al path los laterales visibles de un tono (0 iluminado, 1 de frente, 2 en sombra),
 * entre `top` y `bottom` px sobre el suelo. devuelve true si agregó alguno
 */
function addWalls(
  ctx: CanvasRenderingContext2D,
  entry: LotEntry,
  top: number,
  bottom: number,
  tone: number,
): boolean {
  let any = false;
  for (const ring of entry.screen) {
    const n = ring.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const ex = ring[i] - ring[j];
      // un lateral mira al observador cuando su borde avanza hacia la derecha
      if (ex <= 0) continue;
      const ey = ring[i + 1] - ring[j + 1];
      // si el borde baja hacia la derecha la cara mira a la izquierda, de donde viene la luz
      const faces = ey > ex * 0.16 ? 0 : ey < -ex * 0.16 ? 2 : 1;
      if (faces !== tone) continue;
      ctx.moveTo(ring[j], ring[j + 1] - top);
      ctx.lineTo(ring[i], ring[i + 1] - top);
      ctx.lineTo(ring[i], ring[i + 1] - bottom);
      ctx.lineTo(ring[j], ring[j + 1] - bottom);
      ctx.closePath();
      any = true;
    }
  }
  return any;
}

function pillPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * motor de dibujo de la maqueta isométrica
 *
 * no toca el dom ni crea el canvas: dibuja en el contexto 2d que recibe. guarda entre cuadros
 * la geometría preparada de cada lote, sus cachés de textura y sus animaciones (entrada desde
 * el suelo, elevación al pasar el cursor o seleccionar, pulso de selección)
 *
 * @example
 * const renderer = new IsoRenderer();
 * const result = renderer.render(ctx, { lots, camera, width, height, dpr, time: performance.now() });
 * if (result.animating) requestAnimationFrame(next);
 * const id = renderer.pick(event.offsetX, event.offsetY);
 */
export class IsoRenderer {
  private readonly entries = new Map<string, LotEntry>();
  private order: LotEntry[] = [];
  private readonly visible: LotEntry[] = [];
  private readonly labelQueue: LotEntry[] = [];
  private readonly placed = new Float32Array(MAX_LABELS * 4);
  private readonly glyphs = new Map<IsoGlyph, Path2D>();
  private readonly matrix: IsoMatrix = createMatrix();
  private readonly viewport = { width: 0, height: 0 };
  private readonly result: IsoFrameResult = { animating: false, ambient: false };
  private readonly paint: PaintState = {
    ctx: null as unknown as CanvasRenderingContext2D,
    m: this.matrix,
    width: 0,
    height: 0,
    time: 0,
    ambient: false,
    plantBudget: 0,
    ambientUsed: false,
    gridSize: 100,
  };

  private lastLots: readonly IsoLot[] | null = null;
  private stamp = 0;
  private lastTime = -1;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private pulseStart = -1;
  private dpr = 1;

  // degradados del fondo: se rearman solo si cambia el contexto o el tamaño
  private gradientCtx: CanvasRenderingContext2D | null = null;
  private gradientW = 0;
  private gradientH = 0;
  private background: CanvasGradient | null = null;
  private vignette: CanvasGradient | null = null;
  private gridStroke: CanvasGradient | null = null;

  /**
   * calcula el layout del cuadro y, si hay contexto, lo dibuja. con `ctx` null solo hace el
   * layout: alcanza para que pick funcione donde no hay canvas (pruebas con jsdom)
   */
  render(ctx: CanvasRenderingContext2D | null, frame: IsoFrame): IsoFrameResult {
    const reduced = frame.reducedMotion === true;
    const time = frame.time;
    const dt = this.lastTime < 0 ? 16 : Math.min(64, Math.max(0, time - this.lastTime));
    this.lastTime = time;

    if (frame.lots !== this.lastLots) this.sync(frame.lots, time, reduced);

    const selectedId = frame.selectedId ?? null;
    if (selectedId !== this.selectedId) {
      this.selectedId = selectedId;
      this.pulseStart = selectedId !== null && !reduced ? time : -1;
    }
    this.hoverId = frame.hoverId ?? null;

    this.viewport.width = frame.width;
    this.viewport.height = frame.height;
    cameraMatrix(frame.camera, this.viewport, frame.spin ?? 0, this.matrix);

    let animating = this.layout(frame.width, frame.height, time, dt, reduced);
    if (this.pulseStart >= 0) {
      if (time - this.pulseStart >= PULSE_BEAT_MS * PULSE_BEATS) this.pulseStart = -1;
      else animating = true;
    }

    this.result.animating = animating;
    this.result.ambient = false;
    if (!ctx) return this.result;

    this.dpr = frame.dpr;
    const paint = this.paint;
    paint.ctx = ctx;
    paint.width = frame.width;
    paint.height = frame.height;
    paint.time = time;
    paint.ambient = frame.ambient === true && !reduced;
    paint.plantBudget = PLANT_BUDGET;
    paint.ambientUsed = false;
    paint.gridSize = frame.gridSize ?? 100;

    ctx.setTransform(frame.dpr, 0, 0, frame.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash(NO_DASH);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';

    this.drawBackground(ctx, frame.width, frame.height);
    if (frame.showGrid !== false) this.drawGrid(ctx, frame.width, frame.height, paint.gridSize);
    this.drawShadows(ctx);
    for (const entry of this.visible) this.drawLot(ctx, entry);
    ctx.globalAlpha = 1;
    this.drawPulse(ctx, time);
    for (const entry of this.visible) this.drawMarker(ctx, entry, time, reduced);
    this.drawLabels(ctx, frame.width, frame.height, time, reduced);
    ctx.globalAlpha = 1;

    this.result.ambient = paint.ambientUsed;
    return this.result;
  }

  /**
   * id del lote que se ve en un punto de la pantalla (px de css), según el último cuadro: el
   * de más adelante si se tapan, contando la cara superior, los laterales y el globo del
   * marcador. un hueco no cuenta. null si no hay ninguno
   */
  pick(sx: number, sy: number): string | null {
    const list = this.visible;
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      if (entry.markerR <= 0) continue;
      const dx = sx - entry.markerX;
      const dy = sy - entry.markerY;
      const reach = entry.markerR + 2;
      if (dx * dx + dy * dy <= reach * reach) return entry.id;
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      const h = entry.height;
      if (sx < entry.minSx || sx > entry.maxSx || sy < entry.minSy - h || sy > entry.maxSy) {
        continue;
      }
      // el punto toca el bloque si cae en la cara superior (el suelo corrido hacia arriba) o
      // si, bajando hasta el suelo, cruza un borde: ahí hay un lateral
      if (
        pointInFlatRings(entry.screen, sx, sy + h) ||
        verticalSegmentCrossesFlatRings(entry.screen, sx, sy, sy + h)
      ) {
        return entry.id;
      }
    }
    return null;
  }

  private sync(lots: readonly IsoLot[], time: number, reduced: boolean): void {
    this.lastLots = lots;
    this.stamp++;
    const order: LotEntry[] = [];
    let fresh = 0;
    for (const lot of lots) {
      let entry = this.entries.get(lot.id);
      if (entry && entry.seenIn === this.stamp) continue;
      if (!entry) {
        entry = createEntry(lot);
        entry.rise = reduced ? 1 : 0;
        entry.bornAt = reduced ? -Infinity : -1;
        this.entries.set(lot.id, entry);
        fresh++;
      } else {
        if (entry.source !== lot.rings) prepareGeometry(entry, lot.rings);
        entry.lot = lot;
      }
      if (entry.labelText !== lot.label) {
        entry.labelText = lot.label;
        entry.labelWidth = -1;
      }
      const sublabel = lot.sublabel ?? '';
      if (entry.sublabelText !== sublabel) {
        entry.sublabelText = sublabel;
        entry.sublabelWidth = -1;
      }
      entry.seenIn = this.stamp;
      order.push(entry);
    }
    if (this.entries.size > order.length) {
      for (const [id, entry] of this.entries) {
        if (entry.seenIn !== this.stamp) this.entries.delete(id);
      }
    }
    if (fresh > 0 && !reduced) {
      // los que entran juntos suben escalonados, sin que el último tarde demasiado
      const step = fresh > 1 ? Math.min(STAGGER_MS, MAX_STAGGER_MS / (fresh - 1)) : 0;
      let index = 0;
      for (const entry of order) {
        if (entry.bornAt === -1) entry.bornAt = time + step * index++;
      }
    }
    this.order = order;
  }

  /** anima, proyecta, descarta lo que no se ve y ordena. devuelve true si algo sigue en movimiento */
  private layout(width: number, height: number, time: number, dt: number, reduced: boolean) {
    const m = this.matrix;
    const areaScale = Math.abs(m.a * m.d - m.b * m.c);
    const visible = this.visible;
    visible.length = 0;
    let animating = false;
    const ease = reduced ? 1 : 1 - Math.exp(-dt / LIFT_TAU_MS);

    for (const entry of this.order) {
      if (entry.rise < 1 || time < entry.bornAt + ENTRY_MS) {
        const t = (time - entry.bornAt) / RISE_MS;
        entry.rise = t >= 1 ? 1 : t <= 0 ? 0 : easeOutBack(t);
        if (time < entry.bornAt + ENTRY_MS) animating = true;
      }
      const target =
        entry.id === this.selectedId ? SELECT_LIFT : entry.id === this.hoverId ? HOVER_LIFT : 0;
      if (entry.lift !== target) {
        entry.lift += (target - entry.lift) * ease;
        if (Math.abs(target - entry.lift) < 0.05) entry.lift = target;
        else animating = true;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let r = 0; r < entry.rings.length; r++) {
        const world = entry.rings[r];
        const screen = entry.screen[r];
        for (let i = 0; i < world.length; i += 2) {
          const x = m.a * world[i] + m.c * world[i + 1] + m.e;
          const y = m.b * world[i] + m.d * world[i + 1] + m.f;
          screen[i] = x;
          screen[i + 1] = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      const size = Math.sqrt(entry.area * areaScale);
      const lift = blockHeight(size) * entry.rise + entry.lift * clamp01(entry.rise);
      entry.minSx = minX;
      entry.minSy = minY;
      entry.maxSx = maxX;
      entry.maxSy = maxY;
      entry.size = size;
      entry.height = lift;
      entry.depth = m.b * entry.anchorX + m.d * entry.anchorY;
      entry.ax = m.a * entry.anchorX + m.c * entry.anchorY + m.e;
      entry.ay = m.b * entry.anchorX + m.d * entry.anchorY + m.f - lift;

      const marker = entry.lot.marker;
      const strong = entry.id === this.selectedId || entry.id === this.hoverId;
      if (marker && entry.rise > 0 && (strong || size >= MARKER_MIN_SIZE)) {
        entry.markerR = strong || size >= MARKER_FULL_SIZE ? MARKER_RADIUS : MARKER_RADIUS_SMALL;
        entry.markerX = entry.ax;
        entry.markerY = entry.ay - entry.markerR - 12;
      } else {
        entry.markerR = 0;
      }

      // margen para la sombra, el contorno y el globo, que se salen de la caja del lote
      const reach = lift + 16;
      entry.visible =
        entry.rise > 0 &&
        entry.screen.length > 0 &&
        maxX >= -reach &&
        minX <= width + reach &&
        maxY >= -reach &&
        minY - lift - 44 <= height;
      if (!entry.visible) {
        entry.markerR = 0;
        continue;
      }
      // inserción ordenada por profundidad: entre cuadros el orden casi no cambia
      let slot = visible.length;
      visible.push(entry);
      while (slot > 0 && visible[slot - 1].depth > entry.depth) {
        visible[slot] = visible[slot - 1];
        slot--;
      }
      visible[slot] = entry;
    }
    return animating;
  }

  private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.gradientCtx !== ctx || this.gradientW !== width || this.gradientH !== height) {
      this.gradientCtx = ctx;
      this.gradientW = width;
      this.gradientH = height;
      const background = ctx.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, PALETTE.haze);
      background.addColorStop(0.42, PALETTE.hazeLow);
      background.addColorStop(1, PALETTE.ground);
      this.background = background;

      const radius = Math.hypot(width, height) / 2;
      const vignette = ctx.createRadialGradient(
        width / 2,
        height / 2,
        radius * 0.55,
        width / 2,
        height / 2,
        radius,
      );
      vignette.addColorStop(0, 'rgb(0 0 0 / 0)');
      vignette.addColorStop(1, PALETTE.vignette);
      this.vignette = vignette;

      // la cuadrícula se pierde en la bruma hacia arriba
      const gridStroke = ctx.createLinearGradient(0, 0, 0, height);
      gridStroke.addColorStop(0, alpha(PALETTE.gridLine, 0));
      gridStroke.addColorStop(0.34, PALETTE.gridLine);
      gridStroke.addColorStop(1, PALETTE.gridLine);
      this.gridStroke = gridStroke;
    }
    if (this.background) {
      ctx.fillStyle = this.background;
      ctx.fillRect(0, 0, width, height);
    }
    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, width, height);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, size: number) {
    if (!(size > 0) || !this.gridStroke) return;
    const m = this.matrix;
    const det = m.a * m.d - m.b * m.c;
    if (det === 0) return;

    // caja en metros de lo que entra en la vista
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let corner = 0; corner < 4; corner++) {
      const u = (corner & 1 ? width : 0) - m.e;
      const v = (corner & 2 ? height : 0) - m.f;
      const x = (m.d * u - m.c * v) / det;
      const y = (m.a * v - m.b * u) / det;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // px entre líneas vecinas de cada familia: las de x constante y las de y constante
    const area = Math.abs(det);
    const gapX = area / Math.hypot(m.c, m.d);
    const gapY = area / Math.hypot(m.a, m.b);

    ctx.strokeStyle = this.gridStroke;
    let step = size;
    let finer = false;
    for (let level = 0; level < 4; level++, step *= 10) {
      const pxX = gapX * step;
      const pxY = gapY * step;
      const fadeX = clamp01((pxX - GRID_FADE_FROM) / GRID_FADE_SPAN);
      const fadeY = clamp01((pxY - GRID_FADE_FROM) / GRID_FADE_SPAN);
      if (fadeX <= 0 && fadeY <= 0) continue;
      const strength = level === 0 ? PALETTE.gridMinorAlpha : PALETTE.gridMajorAlpha;
      // cada 10 recuadros la línea es más marcada, salvo que ya se haya dibujado el nivel fino
      ctx.lineWidth = level === 0 || !finer ? 1 : 1.5;
      if (fadeX > 0) {
        ctx.globalAlpha = strength * fadeX;
        ctx.beginPath();
        const last = Math.floor(maxX / step);
        for (let k = Math.ceil(minX / step); k <= last; k++) {
          const x = k * step;
          ctx.moveTo(m.a * x + m.c * minY + m.e, m.b * x + m.d * minY + m.f);
          ctx.lineTo(m.a * x + m.c * maxY + m.e, m.b * x + m.d * maxY + m.f);
        }
        ctx.stroke();
      }
      if (fadeY > 0) {
        ctx.globalAlpha = strength * fadeY;
        ctx.beginPath();
        const last = Math.floor(maxY / step);
        for (let k = Math.ceil(minY / step); k <= last; k++) {
          const y = k * step;
          ctx.moveTo(m.a * minX + m.c * y + m.e, m.b * minX + m.d * y + m.f);
          ctx.lineTo(m.a * maxX + m.c * y + m.e, m.b * maxX + m.d * y + m.f);
        }
        ctx.stroke();
      }
      finer = true;
      if (level >= 1) break;
    }
    ctx.globalAlpha = 1;
  }

  /** sombras de todos los bloques en pocas pasadas: tres capas corridas dan el borde blando */
  private drawShadows(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PALETTE.shadow;
    for (let layer = 0; layer < SHADOW_STEPS.length; layer++) {
      const reach = SHADOW_STEPS[layer];
      let any = false;
      ctx.beginPath();
      for (const entry of this.visible) {
        const status = entry.lot.status;
        if (entry.height < 1 || status === 'pending' || status === 'draft') continue;
        addOffsetPath(ctx, entry, entry.height * reach + layer, entry.height * reach * 0.5 + layer);
        any = true;
      }
      if (any) ctx.fill();
    }
  }

  private drawLot(ctx: CanvasRenderingContext2D, entry: LotEntry): void {
    const lot = entry.lot;
    const status = lot.status ?? 'normal';
    const h = entry.height;
    const selected = entry.id === this.selectedId;
    const hover = entry.id === this.hoverId;
    const micro = entry.size < MICRO_SIZE;
    const style = coverStyle(lot.cover, lot.crop);
    const tint = lot.tint ?? null;
    const flat = tint !== null || lot.hatched === true || status === 'draft';
    const fade = (entry.rise < 1 ? clamp01(entry.rise * 2.5) : 1) * (status === 'pending' ? 0.62 : 1);
    ctx.globalAlpha = fade;

    if (h >= 0.75) this.drawWalls(ctx, entry, style, h, tint, status === 'draft', fade < 1);

    topPath(ctx, entry, h);
    if (status === 'normal') {
      // medio trazo queda tapado por el relleno: lo que se ve es un contorno fino por fuera
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = micro ? 1.5 : 3;
      ctx.stroke();
    }
    if (status === 'draft') {
      ctx.fillStyle = PALETTE.draftTop;
    } else if (tint !== null) {
      // un color que el canvas no entiende se ignora: que quede el gris de "sin dato" y no el anterior
      ctx.fillStyle = PALETTE.noData;
      ctx.fillStyle = tint;
    } else {
      ctx.fillStyle = lot.hatched ? PALETTE.noData : style.top;
    }
    ctx.fill();
    if (hover && !selected) {
      ctx.fillStyle = PALETTE.hover;
      ctx.fill();
    }
    if (!micro && status === 'normal') {
      ctx.strokeStyle = PALETTE.rim;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }

    if (entry.size >= TEXTURE_MIN_SIZE) {
      const paint = this.paint;
      if (status === 'draft') paintBlueprint(paint, entry, h);
      else if (lot.hatched) paintHatch(paint, entry, h);
      else if (tint !== null) paintTintRows(paint, entry, h);
      else paintCover(paint, entry, style, h, topPath);
      ctx.globalAlpha = fade;
    }

    if (status === 'pending') {
      topPath(ctx, entry, h);
      ctx.setLineDash(DASH_PENDING);
      ctx.strokeStyle = PALETTE.pendingBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
    } else if (status === 'draft') {
      topPath(ctx, entry, h);
      ctx.strokeStyle = PALETTE.accentStrong;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (entry.size >= 60) this.drawHandles(ctx, entry, h);
    }
    if (selected) {
      topPath(ctx, entry, h);
      ctx.strokeStyle = PALETTE.accentGlow;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = PALETTE.accent;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  private drawWalls(
    ctx: CanvasRenderingContext2D,
    entry: LotEntry,
    style: CoverStyle,
    h: number,
    tint: string | null,
    draft: boolean,
    translucent: boolean,
  ): void {
    const flatColor = tint ?? (entry.lot.hatched ? PALETTE.noData : null);
    if (h < SIMPLE_WALL_PX && !translucent) {
      // bloque bajo: alcanza con pintar la base, que asoma por debajo de la cara superior
      ctx.beginPath();
      addOffsetPath(ctx, entry, 0, 0);
      if (draft) {
        ctx.fillStyle = PALETTE.draftWalls[1];
        ctx.fill();
      } else if (flatColor !== null) {
        ctx.fillStyle = PALETTE.noData;
        ctx.fillStyle = flatColor;
        ctx.fill();
        ctx.fillStyle = PALETTE.darken[1];
        ctx.fill();
      } else {
        ctx.fillStyle = PALETTE.soil[1];
        ctx.fill();
      }
      return;
    }

    const whole: WallTones | null = draft ? PALETTE.draftWalls : null;
    const band = whole || flatColor !== null || h < 7 ? 0 : Math.min(5.5, Math.max(2, h * 0.3));
    for (let tone = 0; tone < 3; tone++) {
      ctx.beginPath();
      if (!addWalls(ctx, entry, h - band, 0, tone)) continue;
      if (whole) {
        ctx.fillStyle = whole[tone];
        ctx.fill();
      } else if (flatColor !== null) {
        ctx.fillStyle = PALETTE.noData;
        ctx.fillStyle = flatColor;
        ctx.fill();
        ctx.fillStyle = PALETTE.darken[tone];
        ctx.fill();
      } else {
        ctx.fillStyle = PALETTE.soil[tone];
        ctx.fill();
      }
      if (band > 0) {
        ctx.beginPath();
        addWalls(ctx, entry, h, h - band, tone);
        ctx.fillStyle = style.band[tone];
        ctx.fill();
      }
    }
  }

  /** vértices del borrador como manijas, igual que en un editor de planos */
  private drawHandles(ctx: CanvasRenderingContext2D, entry: LotEntry, h: number): void {
    const ring = entry.screen[0];
    if (!ring || ring.length / 2 > MAX_HANDLES) return;
    ctx.fillStyle = PALETTE.handleFill;
    ctx.strokeStyle = PALETTE.accentStrong;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < ring.length; i += 2) ctx.rect(ring[i] - 3, ring[i + 1] - h - 3, 6, 6);
    ctx.fill();
    ctx.stroke();
  }

  /** anillo que late dos veces alrededor del lote recién seleccionado */
  private drawPulse(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.pulseStart < 0 || this.selectedId === null) return;
    const entry = this.entries.get(this.selectedId);
    if (!entry || !entry.visible) return;
    const beat = ((time - this.pulseStart) / PULSE_BEAT_MS) % 1;
    const grow = 1 + beat * Math.min(0.35, 26 / Math.max(entry.size, 1));
    ctx.globalAlpha = (1 - beat) * (1 - beat) * 0.9;
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = 3 - beat * 1.5;
    ctx.beginPath();
    for (const ring of entry.screen) {
      const n = ring.length;
      for (let i = 0; i < n; i += 2) {
        const x = entry.ax + (ring[i] - entry.ax) * grow;
        const y = entry.ay + (ring[i + 1] - entry.height - entry.ay) * grow;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawMarker(
    ctx: CanvasRenderingContext2D,
    entry: LotEntry,
    time: number,
    reduced: boolean,
  ): void {
    const marker = entry.lot.marker;
    const radius = entry.markerR;
    if (!marker || radius <= 0) return;
    const pop = reduced
      ? 1
      : easeOutBack(clamp01((time - entry.bornAt - MARKER_DELAY_MS) / MARKER_POP_MS));
    if (pop <= 0.02) return;

    const tipX = entry.ax;
    const tipY = entry.ay - 3;
    const r = radius * pop;
    const cx = entry.markerX;
    const cy = tipY - (tipY - entry.markerY) * pop;
    const color = TONE_COLORS[marker.tone] ?? TONE_COLORS.neutral;
    ctx.globalAlpha = clamp01(pop * 1.4) * (entry.lot.status === 'pending' ? 0.9 : 1);

    // sombra apoyada en la cara del lote: ancla el globo al punto que marca
    ctx.fillStyle = PALETTE.balloonShadow;
    ctx.beginPath();
    ctx.ellipse(tipX, entry.ay, r * 0.5, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    const spread = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI / 2 + spread, Math.PI * 2.5 - spread);
    ctx.lineTo(tipX, tipY);
    ctx.closePath();
    ctx.fillStyle = PALETTE.balloon;
    ctx.fill();

    // el borde dice el origen del dato con su forma, no solo con el color
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    if (marker.tone === 'declared') {
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r - 2.75), 0, Math.PI * 2);
      ctx.stroke();
    } else if (marker.tone === 'estimated') {
      ctx.lineCap = 'round';
      ctx.setLineDash(DASH_DOTTED);
      ctx.lineWidth = 2.25;
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.lineCap = 'butt';
    } else {
      ctx.lineWidth = marker.tone === 'verified' ? 2.25 : 1.5;
      ctx.stroke();
    }
    if (marker.simulated) {
      ctx.strokeStyle = PALETTE.simulatedRing;
      ctx.lineWidth = 1.25;
      ctx.setLineDash(DASH_SIMULATED);
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
    }

    const glyph = this.glyphPath(marker.glyph);
    if (glyph) {
      const inner = marker.tone === 'declared' ? r - 3.5 : r - 2;
      const scale = (inner * 1.42) / ISO_GLYPH_BOX;
      const dpr = this.dpr;
      const half = (ISO_GLYPH_BOX * scale) / 2;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (cx - half), dpr * (cy - half));
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(ISO_GLYPH_STROKE, 1.4 / scale);
      ctx.stroke(glyph);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
  }

  private glyphPath(glyph: IsoGlyph): Path2D | null {
    let path = this.glyphs.get(glyph);
    if (!path) {
      if (typeof Path2D === 'undefined') return null;
      path = new Path2D(isoGlyphPath(glyph));
      this.glyphs.set(glyph, path);
    }
    return path;
  }

  /** rótulos tipo hud. se colocan por prioridad y el que pisaría a otro no se dibuja */
  private drawLabels(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    reduced: boolean,
  ): void {
    const queue = this.labelQueue;
    queue.length = 0;
    for (const entry of this.visible) {
      if (entry.labelText === '' || entry.rise < 1) continue;
      const strong = entry.id === this.selectedId || entry.id === this.hoverId;
      if (!strong && entry.size < LABEL_MIN_SIZE) continue;
      // inserción por prioridad: seleccionado, bajo el cursor y después de mayor a menor
      let slot = queue.length;
      queue.push(entry);
      const rank = this.labelRank(entry);
      while (slot > 0 && this.labelRank(queue[slot - 1]) < rank) {
        queue[slot] = queue[slot - 1];
        slot--;
      }
      queue[slot] = entry;
    }
    if (queue.length === 0) return;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const placed = this.placed;
    let count = 0;
    for (const entry of queue) {
      if (count >= MAX_LABELS) break;
      const selected = entry.id === this.selectedId;
      const strong = selected || entry.id === this.hoverId;
      if (entry.labelWidth < 0) this.measureLabel(ctx, entry);
      const lotWidth = entry.maxSx - entry.minSx;
      const full = LABEL_PAD * 2 + entry.labelWidth + LABEL_GAP + entry.sublabelWidth;
      const withSub = entry.sublabelText !== '' && (strong || full <= lotWidth - 6);
      const w = withSub ? full : LABEL_PAD * 2 + entry.labelWidth;
      if (!strong && w > lotWidth * 1.15) continue;

      const x = Math.round(entry.ax - w / 2);
      const y = Math.round(entry.markerR > 0 ? entry.ay + 6 : entry.ay - LABEL_HEIGHT / 2);
      if (x > width || x + w < 0 || y > height || y + LABEL_HEIGHT < 0) continue;
      let clash = false;
      for (let k = 0; k < count * 4 && !clash; k += 4) {
        clash =
          x < placed[k + 2] + 3 &&
          x + w + 3 > placed[k] &&
          y < placed[k + 3] + 3 &&
          y + LABEL_HEIGHT + 3 > placed[k + 1];
      }
      if (clash) continue;
      placed[count * 4] = x;
      placed[count * 4 + 1] = y;
      placed[count * 4 + 2] = x + w;
      placed[count * 4 + 3] = y + LABEL_HEIGHT;
      count++;

      const fade = reduced ? 1 : clamp01((time - entry.bornAt - LABEL_DELAY_MS) / LABEL_FADE_MS);
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;
      pillPath(ctx, x, y, w, LABEL_HEIGHT, LABEL_HEIGHT / 2);
      ctx.fillStyle = PALETTE.labelBg;
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = PALETTE.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.font = LABEL_FONT;
      ctx.fillStyle = PALETTE.labelText;
      ctx.fillText(entry.labelText, x + LABEL_PAD, y + LABEL_HEIGHT / 2 + 0.5);
      if (withSub) {
        ctx.font = SUBLABEL_FONT;
        ctx.fillStyle = PALETTE.labelSub;
        const subX = x + LABEL_PAD + entry.labelWidth + LABEL_GAP;
        ctx.fillText(entry.sublabelText, subX, y + LABEL_HEIGHT / 2 + 0.5);
      }
    }
    ctx.globalAlpha = 1;
  }

  private labelRank(entry: LotEntry): number {
    if (entry.id === this.selectedId) return 2e9;
    if (entry.id === this.hoverId) return 1e9;
    return entry.size;
  }

  private measureLabel(ctx: CanvasRenderingContext2D, entry: LotEntry): void {
    ctx.font = LABEL_FONT;
    let text = entry.lot.label;
    let width = ctx.measureText(text).width;
    // un nombre larguísimo se corta: el rótulo no puede tapar medio mapa
    while (width > LABEL_MAX_TEXT && text.length > 4) {
      text = `${text.slice(0, Math.max(3, text.length - 3)).trimEnd()}…`;
      width = ctx.measureText(text).width;
      if (text.length <= 4) break;
    }
    entry.labelText = text;
    entry.labelWidth = width;
    ctx.font = SUBLABEL_FONT;
    entry.sublabelWidth =
      entry.sublabelText === '' ? 0 : ctx.measureText(entry.sublabelText).width;
  }
}
