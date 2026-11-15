import { BLOTCH_POINTS, LotEntry, RowSet, blotchesOf, buildRows, scatterOf } from './lot-entry';
import { CoverStyle, PALETTE, PlantKind } from './palette';
import { hash2 } from './prng';
import { IsoMatrix } from './projection';

/**
 * texturas de la cara superior: hileras, plantas y detalle de cada tipo de cobertura
 *
 * todo lo que se dibuja acá es ilustrativo. las hileras no están a escala y las plantas no
 * representan densidad ni altura: solo ayudan a reconocer el estado registrado del lote
 */

/** datos del cuadro que necesitan los pintores. el motor reusa siempre el mismo objeto */
export interface PaintState {
  ctx: CanvasRenderingContext2D;
  m: IsoMatrix;
  width: number;
  height: number;
  time: number;
  /** true si este cuadro puede mostrar movimiento ambiente */
  ambient: boolean;
  /** plantas que todavía se pueden dibujar en este cuadro */
  plantBudget: number;
  /** queda en true si se dibujó algo que cambia con el tiempo */
  ambientUsed: boolean;
  gridSize: number;
}

// separación base entre hileras en metros. se duplica al alejar y se divide al acercar
const BASE_SPACING = 8;
const MIN_ROW_PX = 6.5;
// a partir de esta separación en pantalla se dibujan plantas una por una
const PLANT_PX = 15;
const MIN_PLANT_SPACING = 2;
const HATCH_PX = 7;
const MAX_ROW_PLANTS = 512;

const NO_DASH: number[] = [];
const dash: number[] = [0, 0];

// resultado de pickSpacing, en variables del módulo para no crear objetos por lote
let lodSpacing = BASE_SPACING;
let lodPx = 0;
let lodPlants = false;

/** px que separan en pantalla dos hileras de dirección `angle` que están a un metro */
function perpScale(m: IsoMatrix, angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = Math.hypot(m.a * cos + m.c * sin, m.b * cos + m.d * sin);
  return along > 0 ? Math.abs(m.a * m.d - m.b * m.c) / along : 0;
}

function pickSpacing(perp: number, allowPlants: boolean): void {
  let spacing = BASE_SPACING;
  let px = perp * spacing;
  lodPlants = false;
  if (px >= PLANT_PX && allowPlants) {
    lodPlants = true;
    while (px >= PLANT_PX * 2 && spacing > MIN_PLANT_SPACING) {
      spacing /= 2;
      px /= 2;
    }
  } else {
    while (px < MIN_ROW_PX && spacing < 1e6) {
      spacing *= 2;
      px *= 2;
    }
  }
  lodSpacing = spacing;
  lodPx = px;
}

function ensureRows(
  entry: LotEntry,
  set: RowSet,
  angle: number,
  spacing: number,
  anchored: boolean,
  inset: number,
  sideMargin: number,
): void {
  if (set.spacing !== spacing || set.angle !== angle) {
    buildRows(entry, set, angle, spacing, anchored, inset, sideMargin);
  }
}

function strokeRows(ctx: CanvasRenderingContext2D, set: RowSet, m: IsoMatrix, ty: number): void {
  const segs = set.segs;
  const end = set.count * 4;
  ctx.beginPath();
  for (let i = 0; i < end; i += 4) {
    ctx.moveTo(m.a * segs[i] + m.c * segs[i + 1] + m.e, m.b * segs[i] + m.d * segs[i + 1] + ty);
    ctx.lineTo(
      m.a * segs[i + 2] + m.c * segs[i + 3] + m.e,
      m.b * segs[i + 2] + m.d * segs[i + 3] + ty,
    );
  }
  ctx.stroke();
}

/**
 * pinta la textura de un lote sobre su cara superior, que ya tiene el color de base. `lift` es
 * la altura del bloque en px. `clipTop` deja armado el recorte de la cara para lo que se sale
 */
export function paintCover(
  p: PaintState,
  entry: LotEntry,
  style: CoverStyle,
  lift: number,
  topPath: (ctx: CanvasRenderingContext2D, entry: LotEntry, lift: number) => void,
): void {
  const cover = entry.lot.cover;
  if (cover === 'flooded') {
    paintWater(p, entry, lift, topPath);
    return;
  }
  if (cover === 'burnt') {
    paintBurnt(p, entry, lift, topPath);
    return;
  }
  if (cover === 'bare') {
    paintGrain(p, entry, lift);
    return;
  }
  if (!style.row) return;

  const { ctx, m } = p;
  const ty = m.f - lift;
  pickSpacing(perpScale(m, entry.angle), style.plant !== 'none');
  const spacing = lodSpacing;
  const px = lodPx;
  ensureRows(entry, entry.mainRows, entry.angle, spacing, false, spacing * 0.5, spacing * 0.32);
  const rows = entry.mainRows;
  if (rows.count === 0) return;

  let plants = lodPlants;
  let stride = 1;
  if (plants) {
    // con demasiadas plantas a la vista se saltean posiciones antes que pasarse del tope
    const visibleArea =
      Math.max(0, Math.min(p.width, entry.maxSx) - Math.max(0, entry.minSx)) *
      Math.max(0, Math.min(p.height, entry.maxSy) - Math.max(0, entry.minSy - lift));
    const estimate = Math.min(visibleArea, entry.size * entry.size) / (px * px * 0.85);
    while (estimate / stride > p.plantBudget && stride < 8) stride *= 2;
    if (estimate / stride > p.plantBudget) plants = false;
  }

  ctx.lineCap = 'butt';
  ctx.strokeStyle = plants ? style.plantDark : style.row;
  ctx.lineWidth = Math.max(1, px * (plants ? style.rowWidth * 0.62 : style.rowWidth));
  if (style.rowDash > 0 && !plants) {
    dash[0] = px * style.rowDash;
    dash[1] = px * style.rowDash * 0.75;
    ctx.setLineDash(dash);
  }
  if (plants) ctx.globalAlpha *= 0.42;
  strokeRows(ctx, rows, m, ty);
  if (plants) ctx.globalAlpha /= 0.42;
  if (style.rowDash > 0 && !plants) ctx.setLineDash(NO_DASH);

  if (plants) paintPlants(p, entry, style, rows, ty, px, spacing * stride);
}

const plantX = new Float32Array(MAX_ROW_PLANTS);
const plantY = new Float32Array(MAX_ROW_PLANTS);
const plantR = new Float32Array(MAX_ROW_PLANTS);

/** plantas sobre las hileras, de atrás hacia adelante para que las cercanas tapen a las lejanas */
function paintPlants(
  p: PaintState,
  entry: LotEntry,
  style: CoverStyle,
  rows: RowSet,
  ty: number,
  px: number,
  step: number,
): void {
  const { ctx, m } = p;
  const cos = Math.cos(rows.angle);
  const sin = Math.sin(rows.angle);
  const segs = rows.segs;
  const size = Math.min(26, Math.max(9, px * 0.8));
  const margin = size * 1.6;
  const sway = p.ambient ? size * 0.06 : 0;
  if (sway > 0) p.ambientUsed = true;

  // hacia dónde crece la profundidad: a lo ancho de las hileras y a lo largo de cada una
  const rowsForward = m.b * -sin + m.d * cos > 0;
  const alongForward = m.b * cos + m.d * sin > 0;
  const total = rows.count;
  let count = 0;
  let currentRow = 0;

  for (let k = 0; k < total; k++) {
    const s = rowsForward ? k : total - 1 - k;
    const row = rows.rows[s];
    if (count > 0 && row !== currentRow) {
      drawPlantBatch(ctx, style, count, size, sway, p.time);
      p.plantBudget -= count;
      count = 0;
    }
    currentRow = row;

    const x0 = segs[s * 4];
    const y0 = segs[s * 4 + 1];
    const x1 = segs[s * 4 + 2];
    const y1 = segs[s * 4 + 3];
    const sx0 = m.a * x0 + m.c * y0 + m.e;
    const sy0 = m.b * x0 + m.d * y0 + ty;
    const sx1 = m.a * x1 + m.c * y1 + m.e;
    const sy1 = m.b * x1 + m.d * y1 + ty;
    if (
      (sx0 < -margin && sx1 < -margin) ||
      (sx0 > p.width + margin && sx1 > p.width + margin) ||
      (sy0 < -margin && sy1 < -margin) ||
      (sy0 > p.height + margin && sy1 > p.height + margin)
    ) {
      continue;
    }

    // las plantas caen en múltiplos de `step` medidos a lo largo de la hilera desde el origen:
    // así no se corren al mover la cámara. las hileras impares van desfasadas media posición
    const d0 = x0 * cos + y0 * sin;
    const d1 = x1 * cos + y1 * sin;
    const offset = (row & 1) * step * 0.5;
    const first = Math.ceil((d0 - offset) / step);
    const last = Math.floor((d1 - offset) / step);
    const span = d1 - d0;
    for (let n = first; n <= last && count < MAX_ROW_PLANTS; n++) {
      const i = alongForward ? n : last - (n - first);
      const random = hash2(entry.seed, row, i);
      const t = (offset + (i + (random - 0.5) * 0.3) * step - d0) / span;
      if (t < 0 || t > 1) continue;
      const x = sx0 + (sx1 - sx0) * t;
      const y = sy0 + (sy1 - sy0) * t;
      if (x < -margin || x > p.width + margin || y < -margin || y > p.height + margin) continue;
      plantX[count] = x;
      plantY[count] = y;
      plantR[count] = random;
      count++;
    }
  }
  if (count > 0) {
    drawPlantBatch(ctx, style, count, size, sway, p.time);
    p.plantBudget -= count;
  }
}

function drawPlantBatch(
  ctx: CanvasRenderingContext2D,
  style: CoverStyle,
  count: number,
  size: number,
  sway: number,
  time: number,
): void {
  const kind: PlantKind = style.plant;
  const phase = time * 0.0021;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'bush') {
    // mata baja: cuerpo oscuro y un brillo corrido hacia la luz
    const w = size * 0.5;
    const h = size * 0.5;
    ctx.fillStyle = style.plantDark;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.82 + plantR[i] * 0.36;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x - w * s, y);
      ctx.lineTo(x - w * 0.72 * s, y - h * 0.72 * s);
      ctx.lineTo(x, y - h * s);
      ctx.lineTo(x + w * 0.72 * s, y - h * 0.72 * s);
      ctx.lineTo(x + w * s, y);
      ctx.lineTo(x, y + h * 0.3 * s);
    }
    ctx.fill();
    ctx.fillStyle = style.plantLight;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.82 + plantR[i] * 0.36;
      const x = plantX[i] + (sway > 0 ? Math.sin(phase + plantR[i] * 6.28) * sway : 0);
      const y = plantY[i];
      ctx.moveTo(x - w * 0.62 * s, y - h * 0.3 * s);
      ctx.lineTo(x - w * 0.34 * s, y - h * 0.82 * s);
      ctx.lineTo(x + w * 0.2 * s, y - h * 0.9 * s);
      ctx.lineTo(x + w * 0.12 * s, y - h * 0.34 * s);
    }
    ctx.fill();
    return;
  }

  if (kind === 'stalk') {
    // planta alta: caña, dos hojas que caen y la panoja arriba
    const h = size * 1.25;
    ctx.strokeStyle = style.plantDark;
    ctx.lineWidth = Math.max(1.2, size * 0.15);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.85 + plantR[i] * 0.3;
      const lean = sway > 0 ? Math.sin(phase + plantR[i] * 6.28) * sway * 1.6 : 0;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - h * s);
      ctx.moveTo(x - size * 0.52 * s + lean * 0.5, y - h * 0.34 * s);
      ctx.lineTo(x - size * 0.3 * s + lean * 0.5, y - h * 0.58 * s);
      ctx.lineTo(x + lean * 0.4, y - h * 0.36 * s);
      ctx.moveTo(x + lean * 0.7, y - h * 0.6 * s);
      ctx.lineTo(x + size * 0.32 * s + lean * 0.8, y - h * 0.82 * s);
      ctx.lineTo(x + size * 0.55 * s + lean * 0.8, y - h * 0.56 * s);
    }
    ctx.stroke();
    ctx.strokeStyle = style.plantLight;
    ctx.lineWidth = Math.max(0.8, size * 0.07);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.85 + plantR[i] * 0.3;
      const lean = sway > 0 ? Math.sin(phase + plantR[i] * 6.28) * sway * 1.6 : 0;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x - size * 0.5 * s + lean * 0.5, y - h * 0.36 * s);
      ctx.lineTo(x - size * 0.3 * s + lean * 0.5, y - h * 0.58 * s);
      ctx.moveTo(x + lean * 0.7, y - h * 0.62 * s);
      ctx.lineTo(x + size * 0.32 * s + lean * 0.8, y - h * 0.82 * s);
    }
    ctx.stroke();
    ctx.strokeStyle = style.plantAccent;
    ctx.lineWidth = Math.max(1.2, size * 0.13);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.85 + plantR[i] * 0.3;
      const lean = sway > 0 ? Math.sin(phase + plantR[i] * 6.28) * sway * 1.6 : 0;
      ctx.moveTo(plantX[i] + lean, plantY[i] - h * s);
      ctx.lineTo(plantX[i] + lean * 1.1, plantY[i] - h * 1.14 * s);
    }
    ctx.stroke();
    return;
  }

  if (kind === 'ear') {
    // tres tallos finos con la espiga arriba
    const h = size * 0.95;
    ctx.strokeStyle = style.plantDark;
    ctx.lineWidth = Math.max(0.9, size * 0.07);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.85 + plantR[i] * 0.3;
      const lean = sway > 0 ? Math.sin(phase + plantR[i] * 6.28) * sway * 1.8 : 0;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x, y);
      ctx.lineTo(x - size * 0.3 * s + lean, y - h * 0.7 * s);
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - h * 0.78 * s);
      ctx.moveTo(x, y);
      ctx.lineTo(x + size * 0.3 * s + lean, y - h * 0.68 * s);
    }
    ctx.stroke();
    ctx.strokeStyle = style.plantAccent;
    ctx.lineWidth = Math.max(1.6, size * 0.17);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.85 + plantR[i] * 0.3;
      const lean = sway > 0 ? Math.sin(phase + plantR[i] * 6.28) * sway * 1.8 : 0;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x - size * 0.3 * s + lean, y - h * 0.7 * s);
      ctx.lineTo(x - size * 0.37 * s + lean * 1.1, y - h * 0.98 * s);
      ctx.moveTo(x + lean, y - h * 0.78 * s);
      ctx.lineTo(x + lean * 1.1, y - h * 1.08 * s);
      ctx.moveTo(x + size * 0.3 * s + lean, y - h * 0.68 * s);
      ctx.lineTo(x + size * 0.37 * s + lean * 1.1, y - h * 0.96 * s);
    }
    ctx.stroke();
    return;
  }

  if (kind === 'tuft') {
    // mechón: tres hojas en abanico
    const h = size * 0.62;
    ctx.strokeStyle = style.plantDark;
    ctx.lineWidth = Math.max(1.2, size * 0.14);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.8 + plantR[i] * 0.4;
      const lean = sway > 0 ? Math.sin(phase + plantR[i] * 6.28) * sway : 0;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x - size * 0.34 * s + lean, y - h * 0.62 * s);
      ctx.lineTo(x, y);
      ctx.lineTo(x + size * 0.34 * s + lean, y - h * 0.62 * s);
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - h * s);
    }
    ctx.stroke();
    ctx.strokeStyle = style.plantLight;
    ctx.lineWidth = Math.max(0.8, size * 0.07);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.8 + plantR[i] * 0.4;
      const lean = sway > 0 ? Math.sin(phase + plantR[i] * 6.28) * sway : 0;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x - size * 0.03, y - h * 0.2 * s);
      ctx.lineTo(x + lean - size * 0.03, y - h * s);
      ctx.moveTo(x - size * 0.1 * s, y - h * 0.2 * s);
      ctx.lineTo(x - size * 0.34 * s + lean, y - h * 0.62 * s);
    }
    ctx.stroke();
    return;
  }

  if (kind === 'sprout') {
    // brote recién nacido: dos hojitas en v
    const h = size * 0.36;
    ctx.strokeStyle = style.plantDark;
    ctx.lineWidth = Math.max(1.4, size * 0.15);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.8 + plantR[i] * 0.4;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x - size * 0.22 * s, y - h * s);
      ctx.lineTo(x, y);
      ctx.lineTo(x + size * 0.22 * s, y - h * s);
    }
    ctx.stroke();
    ctx.strokeStyle = style.plantLight;
    ctx.lineWidth = Math.max(0.8, size * 0.07);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.8 + plantR[i] * 0.4;
      ctx.moveTo(plantX[i] - size * 0.2 * s, plantY[i] - h * s);
      ctx.lineTo(plantX[i] - size * 0.06 * s, plantY[i] - h * 0.3 * s);
    }
    ctx.stroke();
    return;
  }

  if (kind === 'stub') {
    // rastrojo: tallos cortos cortados al ras
    const h = size * 0.3;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = style.plantDark;
    ctx.lineWidth = Math.max(1.2, size * 0.1);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.7 + plantR[i] * 0.6;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x - size * 0.22, y);
      ctx.lineTo(x - size * 0.26, y - h * s);
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - h * (1.5 - s));
      ctx.moveTo(x + size * 0.22, y);
      ctx.lineTo(x + size * 0.27, y - h * s * 0.9);
    }
    ctx.stroke();
    return;
  }

  if (kind === 'clod') {
    // terrón: un bulto oscuro con la cara de arriba clara
    const w = size * 0.3;
    ctx.fillStyle = style.plantDark;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.6 + plantR[i] * 0.8;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x - w * s, y);
      ctx.lineTo(x - w * 0.5 * s, y - w * 0.7 * s);
      ctx.lineTo(x + w * 0.6 * s, y - w * 0.6 * s);
      ctx.lineTo(x + w * s, y + w * 0.1 * s);
      ctx.lineTo(x, y + w * 0.35 * s);
    }
    ctx.fill();
    ctx.fillStyle = style.plantLight;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const s = 0.6 + plantR[i] * 0.8;
      const x = plantX[i];
      const y = plantY[i];
      ctx.moveTo(x - w * 0.5 * s, y - w * 0.7 * s);
      ctx.lineTo(x + w * 0.6 * s, y - w * 0.6 * s);
      ctx.lineTo(x + w * 0.1 * s, y - w * 0.25 * s);
    }
    ctx.fill();
  }
}

/** suelo desnudo: grano mínimo, apenas unas motas */
function paintGrain(p: PaintState, entry: LotEntry, lift: number): void {
  if (entry.size < 46) return;
  const { ctx, m } = p;
  const points = scatterOf(entry);
  const ty = m.f - lift;
  const dot = Math.min(3, Math.max(1.2, entry.size / 150));
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? PALETTE.bareGrain : PALETTE.bareSpeck;
    ctx.beginPath();
    for (let i = pass * 3; i < points.length; i += 6) {
      const x = m.a * points[i] + m.c * points[i + 1] + m.e;
      const y = m.b * points[i] + m.d * points[i + 1] + ty;
      const s = dot * (0.7 + points[i + 2] * 0.7);
      ctx.rect(x - s, y - s * 0.3, s * 2, s * 0.6);
    }
    ctx.fill();
  }
}

/** lote anegado: orilla de suelo, agua baja contra la orilla y reflejos */
function paintWater(
  p: PaintState,
  entry: LotEntry,
  lift: number,
  topPath: (ctx: CanvasRenderingContext2D, entry: LotEntry, lift: number) => void,
): void {
  const { ctx, m } = p;
  const shore = Math.min(8, Math.max(1.5, entry.size * 0.045));
  ctx.save();
  topPath(ctx, entry, lift);
  ctx.clip();
  // el trazo va centrado en el borde: recortado, queda solo la mitad de adentro
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PALETTE.waterDeep;
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = shore * 9;
  ctx.stroke();
  ctx.globalAlpha /= 0.55;
  ctx.strokeStyle = PALETTE.shore;
  ctx.lineWidth = shore * 2;
  ctx.stroke();

  if (entry.size >= 34) {
    const points = scatterOf(entry);
    const ty = m.f - lift;
    const reach = Math.min(22, Math.max(4, entry.size * 0.07));
    const drift = p.ambient ? p.time * 0.0011 : 0;
    if (p.ambient) p.ambientUsed = true;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.waterGlint;
    ctx.lineWidth = Math.min(2.4, Math.max(1, entry.size / 120));
    ctx.beginPath();
    const limit = Math.min(points.length, entry.size > 160 ? 108 : 54);
    for (let i = 0; i < limit; i += 3) {
      const wave = drift > 0 ? Math.sin(drift + points[i + 2] * 6.28) : 0;
      const half = reach * (0.35 + points[i + 2] * 0.65) * (1 + wave * 0.25);
      const x = m.a * points[i] + m.c * points[i + 1] + m.e + wave * 2.5;
      const y = m.b * points[i] + m.d * points[i + 1] + ty;
      ctx.moveTo(x - half, y);
      ctx.lineTo(x + half, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** lote quemado: manchas oscuras de borde irregular sobre ceniza */
function paintBurnt(
  p: PaintState,
  entry: LotEntry,
  lift: number,
  topPath: (ctx: CanvasRenderingContext2D, entry: LotEntry, lift: number) => void,
): void {
  if (entry.size < 14) return;
  const { ctx, m } = p;
  const blotches = blotchesOf(entry);
  const ty = m.f - lift;
  const count = blotches.length / (BLOTCH_POINTS * 2);
  ctx.save();
  topPath(ctx, entry, lift);
  ctx.clip();
  for (let pass = 0; pass < 2; pass++) {
    // la segunda pasada repite cada mancha más chica y más oscura: el centro de la quema
    const shrink = pass === 0 ? 1 : 0.55;
    ctx.fillStyle = pass === 0 ? PALETTE.charSoft : PALETTE.char;
    ctx.beginPath();
    for (let b = 0; b < count; b++) {
      const base = b * BLOTCH_POINTS * 2;
      let cx = 0;
      let cy = 0;
      for (let k = 0; k < BLOTCH_POINTS * 2; k += 2) {
        cx += blotches[base + k];
        cy += blotches[base + k + 1];
      }
      cx /= BLOTCH_POINTS;
      cy /= BLOTCH_POINTS;
      for (let k = 0; k < BLOTCH_POINTS * 2; k += 2) {
        const wx = cx + (blotches[base + k] - cx) * shrink;
        const wy = cy + (blotches[base + k + 1] - cy) * shrink;
        const x = m.a * wx + m.c * wy + m.e;
        const y = m.b * wx + m.d * wy + ty;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}

/** capa de datos: hileras muy sutiles sobre el color de la capa, para no perder el relieve */
export function paintTintRows(p: PaintState, entry: LotEntry, lift: number): void {
  const { ctx, m } = p;
  pickSpacing(perpScale(m, entry.angle), false);
  const spacing = lodSpacing;
  ensureRows(entry, entry.mainRows, entry.angle, spacing, false, spacing * 0.5, spacing * 0.32);
  if (entry.mainRows.count === 0) return;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = PALETTE.tintRow;
  ctx.lineWidth = Math.max(1, lodPx * 0.3);
  strokeRows(ctx, entry.mainRows, m, m.f - lift);
}

/** trama de "sin dato": líneas finas en diagonal respecto de los lados del lote */
export function paintHatch(p: PaintState, entry: LotEntry, lift: number): void {
  const { ctx, m } = p;
  const angle = entry.angle + Math.PI / 4;
  const perp = perpScale(m, angle);
  if (!(perp > 0)) return;
  // la separación se ajusta en potencias de dos para que las líneas no bailen al hacer zoom
  const spacing = Math.pow(2, Math.ceil(Math.log2(HATCH_PX / perp)));
  ensureRows(entry, entry.auxRowsA, angle, spacing, false, 0, 0);
  if (entry.auxRowsA.count === 0) return;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = PALETTE.hatch;
  ctx.lineWidth = 1.25;
  strokeRows(ctx, entry.auxRowsA, m, m.f - lift);
}

/** borrador: la cuadrícula del mundo dibujada sobre el lote, como un plano de obra */
export function paintBlueprint(p: PaintState, entry: LotEntry, lift: number): void {
  const { ctx, m } = p;
  const grid = p.gridSize;
  if (!(grid > 0) || perpScale(m, 0) * grid < 5) return;
  ensureRows(entry, entry.auxRowsA, 0, grid, true, 0, 0);
  ensureRows(entry, entry.auxRowsB, Math.PI / 2, grid, true, 0, 0);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = PALETTE.draftLine;
  ctx.lineWidth = 1;
  if (entry.auxRowsA.count > 0) strokeRows(ctx, entry.auxRowsA, m, m.f - lift);
  if (entry.auxRowsB.count > 0) strokeRows(ctx, entry.auxRowsB, m, m.f - lift);
}
