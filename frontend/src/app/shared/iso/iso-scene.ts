import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  booleanAttribute,
  effect,
  inject,
  input,
  numberAttribute,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { clamp01, easeInOutCubic, easeOutCubic } from './easing';
import { IsoCamera, IsoLot, IsoRing, IsoRotation, IsoViewChange } from './model';
import {
  ISO_MAX_ZOOM,
  ISO_MIN_ZOOM,
  fitCamera,
  lerpCamera,
  scaleBar,
  unproject,
} from './projection';
import { IsoRenderer } from './renderer';

const DPR_MAX = 2;
const CAMERA_MS = 450;
const SPIN_MS = 420;
const CLICK_SLOP_PX = 5;
const KEY_PAN_FRACTION = 0.15;
const AMBIENT_FRAME_MS = 33;
const AMBIENT_IDLE_MS = 6000;
// tope de acercamiento al encuadrar: un lote chico no tiene que llenar la vista a 12 px/m
const FIT_MAX_ZOOM = 3.2;
const FOCUS_PADDING_FRACTION = 0.22;

interface Pointer {
  x: number;
  y: number;
}

/**
 * maqueta isométrica de lotes, dibujada en canvas con el motor propio (IsoRenderer)
 *
 * interactiva: arrastrar mueve, rueda o pellizco acercan, doble clic o Enter abren el lote,
 * R gira, 0 encuadra todo y Escape deselecciona. sin interacción sirve de vista previa o de
 * encabezado: encuadra sola cada vez que cambian los lotes o el tamaño
 *
 * el canvas no reemplaza a la lista de lotes en html: la pantalla que la usa tiene que mostrar
 * además los datos como texto
 *
 * @example
 * <app-iso-scene [lots]="isoLots()" [selectedId]="selected()" ariaLabel="Maqueta de tus lotes"
 *   (lotSelect)="selected.set($event)" (lotOpen)="open($event)">
 *   <div class="hud">...</div>
 * </app-iso-scene>
 */
@Component({
  selector: 'app-iso-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'iso-scene', '[class.is-interactive]': 'interactive()' },
  template: `
    <canvas
      #canvas
      role="img"
      [attr.tabindex]="interactive() ? 0 : null"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-describedby]="interactive() ? helpId : null"
    ></canvas>
    @if (interactive()) {
      <p [id]="helpId" class="visually-hidden">
        Arrastrá para mover la vista, usá la rueda o pellizcá para acercar. Con el teclado: flechas
        para mover, más y menos para acercar, R para girar, 0 para ver todos los lotes, Enter abre
        el lote elegido y Escape lo deselecciona.
      </p>
    }
    <div class="iso-scene__chrome" aria-hidden="true">
      <span class="iso-scene__compass">
        <svg viewBox="0 0 32 32" [style.transform]="'rotate(' + compassDeg() + 'deg)'">
          <path d="M16 3l4.5 13h-9z" class="n" />
          <path d="M11.5 16h9L16 29z" />
          <text x="16" y="2.6" text-anchor="middle">N</text>
        </svg>
      </span>
      <span class="iso-scene__scale">
        <i [style.width.px]="scalePx()"></i>
        {{ scaleLabel() }}
      </span>
    </div>
    <ng-content />
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      overflow: hidden;
      min-height: 12rem;
      background: #e9efe2;
      isolation: isolate;
    }
    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      outline: none;
    }
    :host(.is-interactive) canvas {
      touch-action: none;
      cursor: grab;
    }
    :host(.is-interactive) canvas.is-dragging {
      cursor: grabbing;
    }
    :host(.is-interactive) canvas.is-pointing {
      cursor: pointer;
    }
    canvas:focus-visible {
      box-shadow: inset 0 0 0 3px var(--accent, #f2a43a);
    }
    /* brújula y escala en vidrio claro: lo único oscuro sobre la maqueta es su barra (.hud) */
    .iso-scene__chrome {
      position: absolute;
      right: 0.75rem;
      bottom: 0.75rem;
      z-index: 2;
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      pointer-events: none;
      color: var(--ink-2, #3b4a41);
      font: 600 0.72rem/1 var(--font-sans, system-ui);
    }
    .iso-scene__compass,
    .iso-scene__scale {
      background: rgb(255 255 255 / 88%);
      box-shadow:
        0 0 0 1px rgb(21 33 26 / 8%),
        var(--shadow-1);
    }
    .iso-scene__compass {
      display: grid;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
    }
    .iso-scene__compass svg {
      width: 1.9rem;
      height: 1.9rem;
      overflow: visible;
      fill: #a3aea6;
      transition: transform var(--dur-2, 220ms) var(--ease-out, ease-out);
    }
    .iso-scene__compass .n {
      fill: var(--accent-strong, #d98512);
    }
    .iso-scene__compass text {
      fill: var(--ink, #15211a);
      font: 700 6px var(--font-sans, system-ui);
      dominant-baseline: auto;
    }
    .iso-scene__scale {
      display: grid;
      gap: 0.25rem;
      padding: 0.4rem 0.55rem;
      border-radius: var(--radius-sm, 8px);
    }
    .iso-scene__scale i {
      display: block;
      height: 0.35rem;
      border: 2px solid currentColor;
      border-top: none;
    }
  `,
})
export class IsoScene {
  private static nextId = 0;

  readonly lots = input<readonly IsoLot[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly interactive = input(true, { transform: booleanAttribute });
  readonly showGrid = input(true, { transform: booleanAttribute });
  /** lado de cada recuadro de la cuadrícula en metros (100 = una hectárea) */
  readonly gridSize = input(100, { transform: numberAttribute });
  /** movimiento ambiente sutil (agua, cultivos), solo con la vista en pantalla */
  readonly ambient = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input('Maqueta isométrica de los lotes');
  /** margen libre al encuadrar, en px */
  readonly fitPadding = input(48, { transform: numberAttribute });

  /** clic o tap sobre un lote, o null en el vacío */
  readonly lotSelect = output<string | null>();
  /** doble clic o Enter sobre el lote elegido */
  readonly lotOpen = output<string>();
  readonly lotHover = output<string | null>();
  readonly viewChange = output<IsoViewChange>();

  protected readonly helpId = `iso-scene-help-${IsoScene.nextId++}`;
  protected readonly compassDeg = signal(0);
  protected readonly scalePx = signal(0);
  protected readonly scaleLabel = signal('');

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly renderer = new IsoRenderer();

  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly camera: IsoCamera = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 };
  private hasCamera = false;
  private cameraAnim: { from: IsoCamera; to: IsoCamera; start: number } | null = null;
  private spinAnim: { dir: 1 | -1; start: number } | null = null;
  private spin = 0;
  private raf = 0;
  private ambientTimer: ReturnType<typeof setTimeout> | null = null;
  private lastInteraction = 0;
  private hoverId: string | null = null;
  private onScreen = true;
  private destroyed = false;
  private reducedMotion = false;
  private lastEmitted = { zoom: -1, rotation: -1 };

  private readonly pointers = new Map<number, Pointer>();
  private dragStart: Pointer | null = null;
  private dragged = false;
  private pinch: { distance: number; zoom: number } | null = null;

  constructor() {
    const media = this.view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = media?.matches ?? false;

    effect(() => {
      const lots = this.lots();
      untracked(() => {
        if (!this.interactive() || (!this.hasCamera && lots.length > 0)) this.fitAll(false);
        this.requestFrame();
      });
    });
    effect(() => {
      this.selectedId();
      this.showGrid();
      this.gridSize();
      untracked(() => this.requestFrame());
    });

    afterNextRender(() => this.setup());
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  /** encuadra todos los lotes */
  fitAll(animate = true): void {
    const rings = this.lots().flatMap((lot) => lot.rings);
    this.fitRings(rings, this.fitPadding(), animate);
  }

  /** acerca la cámara a un lote */
  focusLot(id: string, animate = true): void {
    const lot = this.lots().find((item) => item.id === id);
    if (!lot) return;
    const padding = Math.max(
      this.fitPadding(),
      Math.min(this.width, this.height) * FOCUS_PADDING_FRACTION,
    );
    this.fitRings(lot.rings, padding, animate);
  }

  /** acerca (factor mayor que 1) o aleja la vista alrededor del centro */
  zoomBy(factor: number): void {
    this.touch();
    this.zoomAt(this.width / 2, this.height / 2, factor);
  }

  /** gira la maqueta un cuarto de vuelta */
  rotate(dir: 1 | -1 = 1): void {
    this.touch();
    if (this.spinAnim) this.finishSpin();
    if (this.reducedMotion) {
      this.camera.rotation = ((((this.camera.rotation + dir) % 4) + 4) % 4) as IsoRotation;
      this.requestFrame();
      return;
    }
    this.spinAnim = { dir, start: -1 };
    this.requestFrame();
  }

  /** vuelve a la vista inicial: norte arriba a la derecha y todos los lotes encuadrados */
  resetView(): void {
    this.camera.rotation = 0;
    this.spin = 0;
    this.spinAnim = null;
    this.fitAll(true);
  }

  private fitRings(rings: readonly IsoRing[], padding: number, animate: boolean): void {
    if (this.width <= 0 || this.height <= 0) return;
    if (rings.length === 0) {
      this.requestFrame();
      return;
    }
    const target = fitCamera(
      rings,
      { width: this.width, height: this.height },
      this.camera.rotation,
      padding,
      FIT_MAX_ZOOM,
    );
    if (!target) return;
    if (!animate || !this.hasCamera || this.reducedMotion) {
      Object.assign(this.camera, target);
      this.cameraAnim = null;
    } else {
      this.cameraAnim = { from: { ...this.camera }, to: target, start: -1 };
    }
    this.hasCamera = true;
    this.requestFrame();
  }

  private setup(): void {
    const canvas = this.canvasRef().nativeElement;
    try {
      this.ctx = canvas.getContext('2d');
    } catch {
      this.ctx = null;
    }
    this.measure();

    const ResizeObserverCtor = this.view?.ResizeObserver;
    if (ResizeObserverCtor) {
      const observer = new ResizeObserverCtor(() => {
        this.measure();
        if (!this.interactive() || !this.hasCamera) this.fitAll(false);
        this.requestFrame();
      });
      observer.observe(this.host.nativeElement);
      this.cleanups.push(() => observer.disconnect());
    }
    const IntersectionObserverCtor = this.view?.IntersectionObserver;
    if (IntersectionObserverCtor) {
      const observer = new IntersectionObserverCtor((entries) => {
        this.onScreen = entries.some((entry) => entry.isIntersecting);
        if (this.onScreen) this.requestFrame();
      });
      observer.observe(this.host.nativeElement);
      this.cleanups.push(() => observer.disconnect());
    }

    if (this.interactive()) this.listen(canvas);
    if (!this.hasCamera) this.fitAll(false);
    this.requestFrame();
  }

  private readonly cleanups: (() => void)[] = [];

  private on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler as EventListener, options);
    this.cleanups.push(() => target.removeEventListener(type, handler as EventListener, options));
  }

  private listen(canvas: HTMLCanvasElement): void {
    this.on(canvas, 'pointerdown', (event) => {
      this.touch();
      canvas.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
      this.cameraAnim = null;
      if (this.pointers.size === 1) {
        this.dragStart = { x: event.offsetX, y: event.offsetY };
        this.dragged = false;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: this.camera.zoom };
        this.dragged = true;
      }
    });

    this.on(canvas, 'pointermove', (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) {
        if (event.pointerType === 'mouse') this.hover(event.offsetX, event.offsetY);
        return;
      }
      const current = { x: event.offsetX, y: event.offsetY };
      this.pointers.set(event.pointerId, current);
      if (this.pointers.size >= 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const target = (this.pinch.zoom * distance) / this.pinch.distance;
        this.zoomAt(midX, midY, target / this.camera.zoom);
        return;
      }
      if (this.dragStart && !this.dragged) {
        const moved = Math.hypot(current.x - this.dragStart.x, current.y - this.dragStart.y);
        if (moved < CLICK_SLOP_PX) return;
        this.dragged = true;
        canvas.classList.add('is-dragging');
      }
      this.panScreen(current.x - previous.x, current.y - previous.y);
    });

    const release = (event: PointerEvent): void => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size > 0) return;
      canvas.classList.remove('is-dragging');
      if (!this.dragged && event.type === 'pointerup') {
        this.lotSelect.emit(this.renderer.pick(event.offsetX, event.offsetY));
      }
      this.dragStart = null;
      this.dragged = false;
      this.emitView();
    };
    this.on(canvas, 'pointerup', release);
    this.on(canvas, 'pointercancel', release);
    this.on(canvas, 'pointerleave', (event) => {
      if (event.pointerType === 'mouse' && this.pointers.size === 0) this.setHover(null);
    });

    this.on(canvas, 'dblclick', (event) => {
      const id = this.renderer.pick(event.offsetX, event.offsetY);
      if (id) this.lotOpen.emit(id);
    });

    this.on(
      canvas,
      'wheel',
      (event) => {
        event.preventDefault();
        this.touch();
        this.cameraAnim = null;
        const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
        const factor = Math.exp(-event.deltaY * lines * 0.0016);
        this.zoomAt(event.offsetX, event.offsetY, factor);
        this.emitView();
      },
      { passive: false },
    );

    this.on(canvas, 'keydown', (event) => this.onKey(event));
  }

  private onKey(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const stepX = this.width * KEY_PAN_FRACTION;
    const stepY = this.height * KEY_PAN_FRACTION;
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft':
        this.panScreen(stepX, 0);
        break;
      case 'ArrowRight':
        this.panScreen(-stepX, 0);
        break;
      case 'ArrowUp':
        this.panScreen(0, stepY);
        break;
      case 'ArrowDown':
        this.panScreen(0, -stepY);
        break;
      case '+':
      case '=':
        this.zoomBy(1.35);
        break;
      case '-':
      case '_':
        this.zoomBy(1 / 1.35);
        break;
      case 'r':
      case 'R':
        this.rotate(event.shiftKey ? -1 : 1);
        break;
      case '0':
        this.fitAll(true);
        break;
      case 'Enter': {
        const id = this.selectedId();
        if (id) this.lotOpen.emit(id);
        else handled = false;
        break;
      }
      case 'Escape':
        this.lotSelect.emit(null);
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      this.touch();
      this.emitView();
    }
  }

  private hover(sx: number, sy: number): void {
    this.setHover(this.renderer.pick(sx, sy));
  }

  private setHover(id: string | null): void {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.canvasRef().nativeElement.classList.toggle('is-pointing', id !== null);
    this.lotHover.emit(id);
    this.requestFrame();
  }

  /** mueve la vista para que el suelo siga al puntero */
  private panScreen(dx: number, dy: number): void {
    const viewport = { width: this.width, height: this.height };
    const a = unproject(this.camera, viewport, 0, 0);
    const b = unproject(this.camera, viewport, dx, dy);
    this.camera.centerX -= b.x - a.x;
    this.camera.centerY -= b.y - a.y;
    this.requestFrame();
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    if (!(factor > 0) || this.width <= 0) return;
    const viewport = { width: this.width, height: this.height };
    const before = unproject(this.camera, viewport, sx, sy);
    this.camera.zoom = Math.min(ISO_MAX_ZOOM, Math.max(ISO_MIN_ZOOM, this.camera.zoom * factor));
    const after = unproject(this.camera, viewport, sx, sy);
    this.camera.centerX += before.x - after.x;
    this.camera.centerY += before.y - after.y;
    this.requestFrame();
  }

  private measure(): void {
    const canvas = this.canvasRef().nativeElement;
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.width = Math.round(rect.width);
    this.height = Math.round(rect.height);
    this.dpr = Math.min(DPR_MAX, this.view?.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.width * this.dpr));
    const h = Math.max(1, Math.round(this.height * this.dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  private touch(): void {
    this.lastInteraction = this.now();
  }

  private now(): number {
    return this.view?.performance?.now() ?? Date.now();
  }

  private requestFrame(): void {
    if (this.raf !== 0 || this.destroyed || !this.view?.requestAnimationFrame) return;
    if (this.ambientTimer !== null) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
    this.raf = this.view.requestAnimationFrame(this.frame);
  }

  private readonly frame = (time: number): void => {
    this.raf = 0;
    if (this.destroyed || this.width <= 0 || this.height <= 0) return;

    if (this.cameraAnim) {
      if (this.cameraAnim.start < 0) this.cameraAnim.start = time;
      const t = clamp01((time - this.cameraAnim.start) / CAMERA_MS);
      lerpCamera(this.cameraAnim.from, this.cameraAnim.to, easeOutCubic(t), this.camera);
      if (t >= 1) {
        this.cameraAnim = null;
        this.emitView();
      }
    }
    if (this.spinAnim) {
      if (this.spinAnim.start < 0) this.spinAnim.start = time;
      const t = clamp01((time - this.spinAnim.start) / SPIN_MS);
      this.spin = this.spinAnim.dir * easeInOutCubic(t);
      if (t >= 1) this.finishSpin();
    }

    const result = this.renderer.render(this.ctx, {
      lots: this.lots(),
      camera: this.camera,
      spin: this.spin,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      time,
      selectedId: this.selectedId(),
      hoverId: this.hoverId,
      showGrid: this.showGrid(),
      gridSize: this.gridSize(),
      ambient: this.ambient() && this.onScreen,
      reducedMotion: this.reducedMotion,
    });
    this.updateChrome();

    if (result.animating || this.cameraAnim || this.spinAnim) {
      this.requestFrame();
      return;
    }
    const idle = this.now() - this.lastInteraction > AMBIENT_IDLE_MS;
    const hidden = this.view?.document.visibilityState === 'hidden';
    if (
      result.ambient &&
      this.ambient() &&
      this.onScreen &&
      !hidden &&
      !idle &&
      !this.reducedMotion
    ) {
      this.ambientTimer = setTimeout(() => {
        this.ambientTimer = null;
        this.requestFrame();
      }, AMBIENT_FRAME_MS);
    }
  };

  private finishSpin(): void {
    if (!this.spinAnim) return;
    const dir = this.spinAnim.dir;
    this.spinAnim = null;
    this.spin = 0;
    this.camera.rotation = ((((this.camera.rotation + dir) % 4) + 4) % 4) as IsoRotation;
    this.emitView();
  }

  private updateChrome(): void {
    // dirección del norte en pantalla: hacia donde avanza el eje y del suelo
    const angle = (this.camera.rotation + this.spin) * (Math.PI / 2);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = cos - sin;
    const dy = -0.5 * (cos + sin);
    const deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90);
    if (deg !== this.compassDeg()) this.compassDeg.set(deg);
    const bar = scaleBar(this.camera.zoom, 96);
    const px = Math.round(bar.px);
    if (px !== this.scalePx()) this.scalePx.set(px);
    if (bar.label !== this.scaleLabel()) this.scaleLabel.set(bar.label);
  }

  private emitView(): void {
    const zoom = Math.round(this.camera.zoom * 1000) / 1000;
    const rotation = this.camera.rotation;
    if (zoom === this.lastEmitted.zoom && rotation === this.lastEmitted.rotation) return;
    this.lastEmitted = { zoom, rotation };
    this.viewChange.emit({ zoom, rotation });
  }

  private teardown(): void {
    this.destroyed = true;
    if (this.raf !== 0) this.view?.cancelAnimationFrame(this.raf);
    if (this.ambientTimer !== null) clearTimeout(this.ambientTimer);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }
}
