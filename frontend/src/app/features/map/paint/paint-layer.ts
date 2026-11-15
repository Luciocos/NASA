import * as L from 'leaflet';

import {
  Cell,
  GridVertex,
  HectareGrid,
  ReadonlyCellSet,
  components,
  rangeCellCount,
  traceRings,
  vertexLatLng,
  visibleCellRange,
} from '../grid';

/** debajo de este zoom la grilla no se dibuja: los recuadros quedan demasiado chicos */
export const PAINT_MIN_ZOOM = 14;

const PANE = 'lotestigo-paint';
const POP_MS = 150;
// con más celdas a la vista que esto no se dibujan las líneas de la grilla
const MAX_GRID_CELLS = 80_000;
// cada cuántas líneas va una más marcada (1 km con recuadros de 1 ha)
const MAJOR_EVERY = 10;

/** qué marca el recuadro fantasma bajo el cursor */
export type GhostMode = 'paint' | 'erase';

interface Pop {
  i: number;
  j: number;
  start: number;
}

interface Colors {
  fill: string;
  edge: string;
  outline: string;
  erase: string;
}

// lo que la api pública de leaflet no expone para seguir la animación de zoom
interface ZoomAnimatedMap {
  _latLngToNewLayerPoint(latlng: L.LatLng, zoom: number, center: L.LatLng): L.Point;
}

// proyección afín de la grilla a píxeles del contenedor, calculada cerca del centro de la vista:
// en lo que entra en pantalla el error es de menos de un píxel
interface Projection {
  i0: number;
  j0: number;
  x0: number;
  y0: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
}

/**
 * capa canvas de leaflet que dibuja la grilla de hectáreas, lo pintado, el contorno de cada
 * sector y el recuadro fantasma bajo el cursor
 *
 * no sabe nada de angular: quien la usa le pasa la grilla y las celdas con `setScene` cada vez
 * que cambian. se redibuja sola al mover, hacer zoom o cambiar el tamaño del mapa, y a demanda
 * (un cuadro por vez) mientras se pinta
 *
 * @example
 * const layer = new PaintLayer().addTo(map);
 * layer.setScene(session.grid, session.cells);
 * layer.setGhost(session.cellAt([lat, lng]), 'paint');
 */
export class PaintLayer extends L.Layer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private grid: HectareGrid | null = null;
  private cells: ReadonlyCellSet | null = null;
  private outlines: GridVertex[][] | null = null;
  private ghost: { cell: Cell; mode: GhostMode } | null = null;
  private pops: Pop[] = [];
  private frame = 0;
  private animating = false;
  private topLeft: L.LatLng | null = null;
  // relleno claro y borde marcado, los mismos del perímetro trazado (tokens --draw-*)
  private colors: Colors = {
    fill: '#f4f9d6',
    edge: '#ffffff',
    outline: '#ffd166',
    erase: '#d64545',
  };

  constructor() {
    super();
    L.Util.setOptions(this, { pane: PANE });
  }

  override onAdd(map: L.Map): this {
    const pane = map.getPane(PANE) ?? map.createPane(PANE);
    pane.style.zIndex = '450';
    pane.style.pointerEvents = 'none';
    const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated', pane);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = readColors(map.getContainer(), this.colors);
    this.reset();
    return this;
  }

  override onRemove(): this {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    return this;
  }

  override getEvents(): Record<string, L.LeafletEventHandlerFn> {
    return {
      viewreset: this.reset,
      zoom: this.reset,
      moveend: this.reset,
      resize: this.reset,
      zoomanim: this.animateZoom as L.LeafletEventHandlerFn,
    };
  }

  /** grilla y celdas a dibujar. llamarla cada vez que cambian */
  setScene(grid: HectareGrid, cells: ReadonlyCellSet): void {
    this.grid = grid;
    this.cells = cells;
    this.outlines = null;
    this.requestDraw();
  }

  /** recuadro fantasma bajo el cursor, o null para sacarlo */
  setGhost(cell: Cell | null, mode: GhostMode = 'paint'): void {
    const same = cell && this.ghost && this.ghost.mode === mode && sameCell(cell, this.ghost.cell);
    if (same || (!cell && !this.ghost)) return;
    this.ghost = cell ? { cell, mode } : null;
    this.requestDraw();
  }

  /** "pop" corto en recuadros recién pintados. con movimiento reducido no hace nada */
  pop(cells: readonly Cell[]): void {
    if (cells.length === 0 || prefersReducedMotion()) return;
    const start = performance.now();
    for (const [i, j] of cells) this.pops.push({ i, j, start });
    this.requestDraw();
  }

  /** dibuja en el próximo cuadro. varias llamadas en el mismo cuadro dibujan una sola vez */
  requestDraw(): void {
    if (this.frame || !this.ctx) return;
    if (typeof requestAnimationFrame !== 'function') {
      this.draw();
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
      if (this.pops.length > 0) this.requestDraw();
    });
  }

  // reubica el canvas sobre la vista actual y lo redibuja
  private reset(): void {
    const map = this._map as L.Map | undefined;
    const canvas = this.canvas;
    if (!map || !canvas) return;
    this.animating = false;
    const size = map.getSize();
    const dpr = globalThis.devicePixelRatio || 1;
    const width = Math.round(size.x * dpr);
    const height = Math.round(size.y * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    }
    this.topLeft = map.containerPointToLatLng([0, 0]);
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    this.draw();
  }

  // durante la animación de zoom el canvas se escala con css como las teselas
  private animateZoom(event: L.ZoomAnimEvent): void {
    const map = this._map as (L.Map & ZoomAnimatedMap) | undefined;
    if (!map || !this.canvas || !this.topLeft) return;
    this.animating = true;
    const scale = map.getZoomScale(event.zoom, map.getZoom());
    const offset = map._latLngToNewLayerPoint(this.topLeft, event.zoom, event.center);
    L.DomUtil.setTransform(this.canvas, offset, scale);
  }

  private draw(): void {
    const map = this._map as L.Map | undefined;
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!map || !ctx || !canvas || this.animating) return;
    const dpr = canvas.width / Math.max(1, map.getSize().x);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const grid = this.grid;
    if (!grid) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bounds = map.getBounds();
    const range = visibleCellRange(
      grid,
      [
        [bounds.getSouth(), bounds.getWest()],
        [bounds.getNorth(), bounds.getEast()],
      ],
      1,
    );
    const p = projection(map, grid, range);
    const cellPx = Math.hypot(p.ux, p.uy);
    const showGrid = map.getZoom() >= PAINT_MIN_ZOOM && rangeCellCount(range) <= MAX_GRID_CELLS;

    if (showGrid) this.drawGridLines(ctx, p, range);
    this.drawCells(ctx, p, range, cellPx);
    this.drawOutlines(ctx, p);
    this.drawPops(ctx, p);
    if (showGrid) this.drawGhost(ctx, p);
  }

  private drawGridLines(
    ctx: CanvasRenderingContext2D,
    p: Projection,
    r: { minI: number; maxI: number; minJ: number; maxJ: number },
  ): void {
    const minor = new Path2D();
    const major = new Path2D();
    for (let i = r.minI; i <= r.maxI + 1; i++) {
      const path = i % MAJOR_EVERY === 0 ? major : minor;
      path.moveTo(...at(p, i, r.minJ));
      path.lineTo(...at(p, i, r.maxJ + 1));
    }
    for (let j = r.minJ; j <= r.maxJ + 1; j++) {
      const path = j % MAJOR_EVERY === 0 ? major : minor;
      path.moveTo(...at(p, r.minI, j));
      path.lineTo(...at(p, r.maxI + 1, j));
    }
    ctx.strokeStyle = 'rgb(255 255 255 / 30%)';
    ctx.lineWidth = 1;
    ctx.stroke(minor);
    ctx.strokeStyle = 'rgb(255 255 255 / 55%)';
    ctx.lineWidth = 1.5;
    ctx.stroke(major);
  }

  private drawCells(
    ctx: CanvasRenderingContext2D,
    p: Projection,
    r: { minI: number; maxI: number; minJ: number; maxJ: number },
    cellPx: number,
  ): void {
    const cells = this.cells;
    if (!cells || cells.size === 0) return;
    const path = new Path2D();
    const popping = new Set(this.pops.map((pop) => `${pop.i},${pop.j}`));
    cells.forEach((i, j) => {
      if (i < r.minI || i > r.maxI || j < r.minJ || j > r.maxJ) return;
      if (popping.size > 0 && popping.has(`${i},${j}`)) return;
      quad(path, p, i, j, 1);
    });
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = this.colors.fill;
    ctx.fill(path);
    ctx.globalAlpha = 1;
    // las divisiones entre recuadros, apenas: lo que se lee es la forma entera y su borde
    if (cellPx >= 6) {
      ctx.strokeStyle = this.colors.edge;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }
  }

  private drawOutlines(ctx: CanvasRenderingContext2D, p: Projection): void {
    const cells = this.cells;
    if (!cells || cells.size === 0) return;
    this.outlines ??= components(cells).flatMap((region) => {
      const { exterior, holes } = traceRings(region);
      return [exterior, ...holes];
    });
    const path = new Path2D();
    for (const ring of this.outlines) {
      ring.forEach(([i, j], k) =>
        k === 0 ? path.moveTo(...at(p, i, j)) : path.lineTo(...at(p, i, j)),
      );
      path.closePath();
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgb(11 22 34 / 50%)';
    ctx.lineWidth = 7;
    ctx.stroke(path);
    ctx.strokeStyle = this.colors.outline;
    ctx.lineWidth = 3;
    ctx.stroke(path);
  }

  private drawPops(ctx: CanvasRenderingContext2D, p: Projection): void {
    if (this.pops.length === 0) return;
    const now = performance.now();
    this.pops = this.pops.filter((pop) => now - pop.start < POP_MS);
    const cells = this.cells;
    for (const pop of this.pops) {
      if (!cells?.hasAt(pop.i, pop.j)) continue;
      const t = Math.min(1, (now - pop.start) / POP_MS);
      const eased = 1 - (1 - t) ** 3;
      const path = new Path2D();
      quad(path, p, pop.i, pop.j, 0.55 + 0.45 * eased);
      ctx.globalAlpha = 0.2 + 0.4 * eased;
      ctx.fillStyle = this.colors.fill;
      ctx.fill(path);
      ctx.globalAlpha = eased;
      ctx.strokeStyle = this.colors.edge;
      ctx.lineWidth = 1;
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
  }

  private drawGhost(ctx: CanvasRenderingContext2D, p: Projection): void {
    const ghost = this.ghost;
    if (!ghost) return;
    const [i, j] = ghost.cell;
    const path = new Path2D();
    quad(path, p, i, j, 1);
    ctx.lineWidth = 2;
    if (ghost.mode === 'erase') {
      // la cruz dice "borrar" sin depender del color
      path.moveTo(...at(p, i + 0.25, j + 0.25));
      path.lineTo(...at(p, i + 0.75, j + 0.75));
      path.moveTo(...at(p, i + 0.75, j + 0.25));
      path.lineTo(...at(p, i + 0.25, j + 0.75));
      ctx.strokeStyle = this.colors.erase;
      ctx.setLineDash([4, 3]);
      ctx.stroke(path);
      ctx.setLineDash([]);
      return;
    }
    // el recuadro bajo el cursor es solo un contorno tenue: no se confunde con lo pintado
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgb(255 255 255 / 70%)';
    ctx.stroke(path);
  }
}

function projection(
  map: L.Map,
  grid: HectareGrid,
  range: { minI: number; maxI: number; minJ: number; maxJ: number },
): Projection {
  const i0 = Math.round((range.minI + range.maxI) / 2);
  const j0 = Math.round((range.minJ + range.maxJ) / 2);
  const span = 8;
  const point = (vertex: GridVertex) => map.latLngToContainerPoint(vertexLatLng(grid, vertex));
  const origin = point([i0, j0]);
  const alongI = point([i0 + span, j0]);
  const alongJ = point([i0, j0 + span]);
  return {
    i0,
    j0,
    x0: origin.x,
    y0: origin.y,
    ux: (alongI.x - origin.x) / span,
    uy: (alongI.y - origin.y) / span,
    vx: (alongJ.x - origin.x) / span,
    vy: (alongJ.y - origin.y) / span,
  };
}

function at(p: Projection, i: number, j: number): [number, number] {
  const di = i - p.i0;
  const dj = j - p.j0;
  return [p.x0 + di * p.ux + dj * p.vx, p.y0 + di * p.uy + dj * p.vy];
}

// recuadro [i, j] escalado alrededor de su centro (1 es el tamaño real)
function quad(path: Path2D, p: Projection, i: number, j: number, scale: number): void {
  const a = (1 - scale) / 2;
  const b = 1 - a;
  path.moveTo(...at(p, i + a, j + a));
  path.lineTo(...at(p, i + b, j + a));
  path.lineTo(...at(p, i + b, j + b));
  path.lineTo(...at(p, i + a, j + b));
  path.closePath();
}

function sameCell(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// los colores salen de los tokens del tema (tokens.css)
function readColors(element: HTMLElement, fallback: Colors): Colors {
  const style = getComputedStyle(element);
  const token = (name: string, value: string) => style.getPropertyValue(name).trim() || value;
  return {
    fill: token('--draw-fill', fallback.fill),
    edge: fallback.edge,
    outline: token('--draw-line', fallback.outline),
    erase: token('--danger', fallback.erase),
  };
}
