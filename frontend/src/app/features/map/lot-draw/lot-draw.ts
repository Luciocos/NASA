import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, NavigationExtras, Router } from '@angular/router';
import * as L from 'leaflet';

import { Api } from '../../../core/api';
import {
  createLocalFrame,
  geometryCenter,
  geometryToLocalRings,
} from '../../../core/geo/local-frame';
import { LotSummary, PolygonGeometry } from '../../../core/models';
import { describeBackendError } from '../../../core/offline/http-errors';
import { LotOutbox } from '../../../core/offline/lot-outbox';
import { OFFLINE_STORAGE } from '../../../core/offline/storage';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { Icon } from '../../../shared/ui/icon/icon';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { lotDialogParams } from '../../lot/lot-workspace/lot-link';
import { areaHa, ringCentroid, ringSelfIntersects, toPolygonGeometry } from '../geo';
import { Cell, lineCells, vertexLatLng } from '../grid';
import { Spot, spotFromParams } from '../my-location';
import {
  PAINT_MIN_ZOOM,
  PaintCellSize,
  PaintHud,
  PaintLayer,
  PaintPointer,
  PaintSession,
  PaintSnapshot,
  PaintTool,
  gridAngleFor,
  longestSideDeg,
} from '../paint';
import { LatLng, MIN_VERTICES, PolygonEditor } from '../polygon-editor';
import { DrawTutorial } from './draw-tutorial';
import { Place, PlaceSearchBox } from './place-search';

/** vista amplia de la región pampeana: sin ubicación ni lotes, el mapa arranca acá */
export const REGION_BOUNDS: L.LatLngBoundsLiteral = [
  [-39, -65],
  [-30, -57.5],
];
const REGION_CENTER: [number, number] = [-34.5, -61.25];
const REGION_ZOOM = 6;
/** zoom de campo: con una ubicación el mapa arranca así de cerca */
export const FIELD_ZOOM = 15;
/** más lejos que esto un toque no marca una esquina: el lote saldría gigante */
export const TRACE_MIN_ZOOM = 12;
/** superficie razonable para un lote, en hectáreas */
export const MIN_LOT_HA = 0.5;
export const MAX_LOT_HA = 20_000;

// colores del dibujo sobre la imagen satelital (tokens --draw-*): relleno claro y borde marcado
// con un halo oscuro que lo separa de cualquier imagen
const DRAW_LINE = '#ffd166';
const DRAW_FILL = '#f4f9d6';
const DRAW_HALO = '#0b1622';
const EXISTING_STYLE: L.PathOptions = {
  color: '#ffffff',
  weight: 2,
  dashArray: '6 4',
  fillOpacity: 0.08,
  interactive: false,
};

/** clave del borrador en el dispositivo */
export const DRAFT_KEY = 'lotestigo:draft:v1';
const DRAFT_SAVE_MS = 400;
// sin nada pintado, si el productor se va a pintar más lejos que esto la grilla se recentra
const REANCHOR_M = 20_000;
// "alinear con el lote" busca lotes cuyo centro esté a menos de esto del centro de la vista
const ALIGN_RADIUS_M = 5_000;
const CREATED_NOTICE_MS = 700;
const QUEUED_NOTICE_MS = 1_600;
const MAP_NOTICE_MS = 4_000;

/** cómo se marca el lote */
export type DrawMode = 'paint' | 'trace';

/** borrador guardado en el dispositivo mientras se marca un lote */
export interface LotDraft {
  v: 1;
  mode: DrawMode;
  paint: PaintSnapshot;
  points: LatLng[];
  name: string;
  locality: string;
  province: string;
  renspa: string;
  /** cuándo se guardó, en ISO 8601 */
  savedAt: string;
}

/** una condición del lote para poder guardarlo, con su texto en lenguaje llano */
export interface DrawCheck {
  id: string;
  ok: boolean;
  text: string;
  /** botón que lo resuelve, si hay uno */
  action?: string;
}

/** la indicación que flota sobre el mapa */
interface MapHint {
  text: string;
  tone: 'info' | 'ok' | 'warn';
}

/**
 * alta de un lote sobre imagen satelital (CLAUDE.md, sección 2: "un polígono alcanza para
 * obtener un resultado"). de entrada se traza el perímetro: cada toque en el mapa suma una
 * esquina, arrastrarla la mueve y "Deshacer" o "Empezar de nuevo" corrigen. una sola indicación
 * arriba del mapa dice qué hacer y, al cerrar la forma, una lista corta revisa que esté cerrada,
 * sin cruces y con una superficie razonable
 *
 * arriba del mapa hay un buscador de lugares (OpenStreetMap) y "Usar mi ubicación". con lat y
 * lng en la dirección el mapa arranca ahí; si no, en la región pampeana
 *
 * pintar hectáreas sobre una grilla y el ajuste fino de coordenadas quedan en "Opciones
 * avanzadas". cada modo conserva lo suyo al cambiar. lo marcado y el formulario quedan como
 * borrador en el dispositivo hasta guardar o descartarlo. el dueño del lote lo asigna el backend
 */
@Component({
  imports: [Icon, PageHeader, Disclosure, OriginBadge, PaintHud, DrawTutorial, PlaceSearchBox],
  selector: 'app-lot-draw',
  styleUrls: ['./lot-draw.css', './lot-draw-map.css'],
  templateUrl: './lot-draw.html',
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(document:keyup)': 'onKeyup($event)',
    '(window:blur)': 'spaceHand.set(false)',
  },
})
export class LotDraw {
  private readonly api = inject(Api);
  private readonly outbox = inject(LotOutbox);
  private readonly router = inject(Router);
  private readonly storage = inject(OFFLINE_STORAGE);
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly mapElement = viewChild.required<ElementRef<HTMLElement>>('map');

  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  private readonly draft = readDraft(this.storage);
  /** ubicación que llegó en la dirección (?lat=..&lng=..) desde Mi campo */
  private readonly startSpot = spotFromParams(this.query.get('lat'), this.query.get('lng'));
  private readonly coarse = this.view?.matchMedia?.('(pointer: coarse)').matches ?? false;
  private readonly reducedMotion =
    this.view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // --- trazar perímetro
  private editor = new PolygonEditor(this.draft?.points ?? []);
  // Cambia en cada edición para que las señales derivadas del editor se recalculen
  private readonly revision = signal(0);

  protected readonly points = computed(() => (this.revision(), [...this.editor.points]));
  protected readonly selected = computed(() => (this.revision(), this.editor.selected));
  protected readonly canUndo = computed(() => (this.revision(), this.editor.canUndo));
  protected readonly missing = computed(() => (this.revision(), this.editor.missingVertices));
  protected readonly area = computed(() => areaHa(this.points()));
  private readonly crosses = computed(() => ringSelfIntersects(this.points()));

  // --- pintar hectáreas
  private paint =
    PaintSession.restore(this.draft?.paint) ??
    new PaintSession(this.startSpot ? [this.startSpot.lat, this.startSpot.lng] : REGION_CENTER);
  private readonly paintRevision = signal(0);
  protected readonly paintState = computed(() => {
    this.paintRevision();
    const paint = this.paint;
    return {
      cells: paint.cells.size,
      areaHa: paint.areaHa(),
      perimeterM: paint.perimeterM(),
      regions: paint.regionCount(),
      cellSize: paint.cellSize,
      rotation: paint.rotationDeg,
      canUndo: paint.canUndo,
      canRedo: paint.canRedo,
    };
  });

  protected readonly mode = signal<DrawMode>(this.draft?.mode ?? 'trace');
  /** "Opciones avanzadas" abierto: lo está siempre mientras se pinta */
  protected readonly advancedOpen = signal(this.mode() === 'paint');
  protected readonly tool = signal<PaintTool>('brush');
  /** barra espaciadora apretada: mano mientras dure */
  protected readonly spaceHand = signal(false);
  protected readonly activeTool = computed<PaintTool>(() =>
    this.spaceHand() ? 'hand' : this.tool(),
  );
  protected readonly zoom = signal(this.startSpot ? FIELD_ZOOM : REGION_ZOOM);
  protected readonly minPaintZoom = PAINT_MIN_ZOOM;
  protected readonly mapNotice = signal<string | null>(null);
  private readonly lots = signal<LotSummary[]>([]);
  protected readonly canAlign = computed(() => this.points().length >= 2 || this.lots().length > 0);

  // --- formulario
  protected readonly name = signal(this.draft?.name ?? '');
  protected readonly locality = signal(this.draft?.locality ?? '');
  protected readonly province = signal(this.draft?.province ?? '');
  protected readonly renspa = signal(this.draft?.renspa ?? '');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** nombre que se usa si la persona no escribe uno: "Lote 3", sin repetir los suyos */
  protected readonly suggestedName = computed(() => {
    const names = [
      ...this.lots().map((lot) => lot.name),
      ...this.outbox.pending().map((item) => item.body.name),
    ];
    const taken = new Set(names.map((name) => name.trim().toLocaleLowerCase('es-AR')));
    let n = names.length + 1;
    while (taken.has(`field ${n}`)) n++;
    return `Field ${n}`;
  });

  /** lo que falta o lo que está mal para poder guardar, según el modo */
  protected readonly checks = computed<readonly DrawCheck[]>(() =>
    this.mode() === 'paint' ? this.paintChecks() : this.traceChecks(),
  );
  protected readonly ready = computed(
    () => this.checks().length > 0 && this.checks().every((check) => check.ok),
  );
  protected readonly canSave = computed(() => !this.saving() && this.ready());
  /** superficie marcada hasta ahora, o null si todavía no hay forma */
  protected readonly shownArea = computed(() => {
    if (this.mode() === 'paint') {
      const state = this.paintState();
      return state.cells > 0 ? state.areaHa : null;
    }
    return this.points().length >= MIN_VERTICES ? this.area() : null;
  });

  protected readonly hint = computed<MapHint>(() => {
    const notice = this.mapNotice();
    if (notice) return { text: notice, tone: 'info' };
    return this.mode() === 'paint' ? this.paintHint() : this.traceHint();
  });

  // --- borrador
  protected readonly draftRestored = signal(this.draft !== null);
  protected readonly confirmDiscard = signal(false);
  protected readonly hasDraft = computed(
    () =>
      this.paintState().cells > 0 ||
      this.points().length > 0 ||
      [this.name(), this.locality(), this.province(), this.renspa()].some((v) => v.trim() !== ''),
  );

  private map: L.Map | null = null;
  private readonly mapReady = signal(false);
  private polygon: L.Polygon | null = null;
  private halo: L.Polygon | null = null;
  private vertices: L.LayerGroup | null = null;
  private areaTag: L.Marker | null = null;
  private me: L.Marker | null = null;
  private paintLayer: PaintLayer | null = null;
  private pointer: PaintPointer | null = null;
  private dragging = false;
  private strokeLast: Cell | null = null;
  private finished = false;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private navigateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    afterNextRender(() => this.initMap());
    inject(DestroyRef).onDestroy(() => {
      if (this.draftTimer) this.writeDraft();
      [this.draftTimer, this.noticeTimer, this.navigateTimer].forEach((t) => t && clearTimeout(t));
      this.pointer?.destroy();
      this.map?.remove();
    });

    // el modo y la herramienta deciden quién se queda con el arrastre: el mapa o el pincel
    effect(() => {
      const mode = this.mode();
      const tool = this.activeTool();
      if (this.mapReady()) untracked(() => this.applyMode(mode, tool));
    });

    // cualquier cambio en lo marcado o en el formulario actualiza el borrador
    effect(() => {
      this.paintRevision();
      this.revision();
      this.mode();
      this.name();
      this.locality();
      this.province();
      this.renspa();
      untracked(() => this.scheduleDraft());
    });
  }

  // --- acciones comunes

  protected setMode(mode: DrawMode): void {
    if (mode === this.mode()) return;
    this.pointer?.finish();
    this.mode.set(mode);
    this.error.set(null);
    if (mode === 'paint') this.advancedOpen.set(true);
    // en el celular el mapa queda arriba del panel: se lo trae a la vista para empezar
    this.mapElement().nativeElement.scrollIntoView?.({
      block: 'nearest',
      behavior: this.reducedMotion ? 'auto' : 'smooth',
    });
  }

  protected undo(): void {
    if (this.mode() === 'paint') {
      if (this.paint.undo()) this.paintChanged();
      return;
    }
    this.editor.undo();
    this.changed();
  }

  protected redo(): void {
    if (this.mode() === 'paint') {
      if (this.paint.redo()) this.paintChanged();
      return;
    }
    this.editor.redo();
    this.changed();
  }

  /** "Empezar de nuevo": borra lo marcado en el modo actual (se puede deshacer) */
  protected clear(): void {
    this.pointer?.finish();
    if (this.mode() === 'paint') {
      if (this.paint.clear()) this.paintChanged();
      return;
    }
    this.editor.clear();
    this.changed();
  }

  protected runCheck(id: string): void {
    if (id === 'regions') this.keepLargest();
  }

  // --- buscar el campo

  protected goToPlace(place: Place): void {
    const map = this.map;
    if (!map) return;
    const options = { maxZoom: FIELD_ZOOM, padding: [40, 40] as L.PointTuple };
    if (place.bounds) {
      if (this.reducedMotion) map.fitBounds(place.bounds, options);
      else map.flyToBounds(place.bounds, { ...options, duration: 0.8 });
    } else {
      this.moveTo([place.lat, place.lng], 14);
    }
  }

  protected goToSpot(spot: Spot): void {
    this.showMe(spot);
    this.moveTo([spot.lat, spot.lng], FIELD_ZOOM);
    this.flashMap('We found you on the map: look for your field near the blue dot');
  }

  // --- trazar perímetro

  protected selectVertex(index: number): void {
    this.editor.toggleSelect(index);
    this.changed();
  }

  protected removeVertex(index: number): void {
    this.editor.remove(index);
    this.changed();
  }

  /** Edición fina desde el listado: solo acepta coordenadas válidas. */
  protected editCoordinate(index: number, axis: 0 | 1, raw: string): void {
    const value = Number(raw);
    const limit = axis === 0 ? 90 : 180;
    if (raw.trim() === '' || !Number.isFinite(value) || Math.abs(value) > limit) {
      this.changed(); // vuelve a mostrar el valor anterior
      return;
    }
    const point: LatLng = [...this.editor.points[index]];
    point[axis] = value;
    this.editor.move(index, point);
    this.changed();
  }

  // --- pintar hectáreas

  protected setTool(tool: PaintTool): void {
    this.pointer?.finish();
    this.tool.set(tool);
  }

  protected setCellSize(cellSize: PaintCellSize): void {
    if (this.paint.setGrid({ cellSize })) this.paintChanged();
  }

  protected previewRotation(rotationDeg: number): void {
    if (this.paint.previewGrid({ rotationDeg })) this.paintChanged();
  }

  protected commitRotation(): void {
    this.paint.commitGrid();
    this.paintChanged();
  }

  protected keepLargest(): void {
    if (this.paint.keepLargestRegion()) this.paintChanged();
  }

  /** gira la grilla con el lado más largo del perímetro trazado o de un lote cercano */
  protected alignGrid(): void {
    const target = this.alignmentTarget();
    const side = target && longestSideDeg(target.ring);
    if (!target || side === null) {
      this.flashMap('No field nearby to align with: move closer to one or trace its boundary');
      return;
    }
    const angle = gridAngleFor(side);
    this.paint.setGrid({ rotationDeg: angle });
    this.paintChanged();
    this.flashMap(`Grid aligned with ${target.label}: ${formatDegrees(angle)}`);
  }

  protected zoomToPaint(): void {
    this.map?.setZoom(PAINT_MIN_ZOOM + 1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (isTypingTarget(target)) return;
    const key = event.key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        this.undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        this.redo();
      }
      return;
    }
    if (this.mode() === 'trace') {
      if (key === 'escape' && this.editor.selected !== null) {
        this.editor.deselect();
        this.changed();
      }
      return;
    }
    if (event.altKey) return;
    if (key === 'b') this.setTool('brush');
    else if (key === 'e') this.setTool('eraser');
    else if (key === 'h') this.setTool('hand');
    else if (key === ' ' && !isControl(target)) {
      event.preventDefault();
      if (!event.repeat) {
        this.pointer?.finish();
        this.spaceHand.set(true);
      }
    }
  }

  protected onKeyup(event: KeyboardEvent): void {
    if (event.key === ' ') this.spaceHand.set(false);
  }

  // --- borrador

  protected discardDraft(): void {
    this.confirmDiscard.set(false);
    this.draftRestored.set(false);
    this.pointer?.finish();
    const center = this.map?.getCenter();
    this.paint = new PaintSession(center ? [center.lat, center.lng] : REGION_CENTER);
    this.editor = new PolygonEditor();
    this.name.set('');
    this.locality.set('');
    this.province.set('');
    this.renspa.set('');
    this.error.set(null);
    this.removeDraft();
    this.paintChanged();
    this.changed();
  }

  // --- guardar

  protected save(): void {
    if (!this.canSave()) return;
    let geometry: PolygonGeometry;
    try {
      geometry = this.mode() === 'paint' ? this.paint.geometry() : toPolygonGeometry(this.points());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : "Couldn't build the field shape.");
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.outbox
      .createOrQueue({
        name: this.name().trim() || this.suggestedName(),
        locality: this.locality().trim(),
        province: this.province().trim(),
        renspa: this.renspa().trim() || null,
        geometry,
      })
      .subscribe({
        next: (result) => {
          this.finished = true;
          this.removeDraft();
          if (result.kind === 'created') {
            this.notice.set(`Done: we saved “${result.lot.name}”. Opening it…`);
            // Mi campo con el lote nuevo abierto en el popup: al cerrarlo queda en Mi campo, y
            // atrás no vuelve a un trazado vacío
            this.navigateLater(['/mapa'], CREATED_NOTICE_MS, {
              queryParams: lotDialogParams(result.lot.id),
              replaceUrl: true,
            });
          } else {
            this.notice.set(
              'We saved the field on this device: it uploads on its own when you are back online',
            );
            this.navigateLater(['/mapa'], QUEUED_NOTICE_MS);
          }
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(describeSaveError(err));
        },
      });
  }

  protected formatArea(hectares: number): string {
    return formatHa(hectares);
  }

  protected formatPerimeter(meters: number): string {
    return meters >= 1000
      ? `${(meters / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} km`
      : `${Math.round(meters).toLocaleString('en-US')} m`;
  }

  protected formatCoord(value: number): string {
    return value.toFixed(6);
  }

  // --- textos

  private traceChecks(): DrawCheck[] {
    const count = this.points().length;
    if (count < MIN_VERTICES) {
      const missing = this.missing();
      return [
        {
          id: 'closed',
          ok: false,
          text: `Tap ${missing} more ${missing === 1 ? 'corner' : 'corners'} to close the shape`,
        },
      ];
    }
    const area = this.area();
    const crosses = this.crosses();
    const size = formatHa(area);
    return [
      { id: 'closed', ok: true, text: `Shape closed: ${count} corners` },
      {
        id: 'crossing',
        ok: !crosses,
        text: crosses ? 'The sides cross: move a corner or undo' : 'No crossings',
      },
      area < MIN_LOT_HA
        ? { id: 'area', ok: false, text: `Too small for a field: ${size} (minimum ½ ha)` }
        : area > MAX_LOT_HA
          ? { id: 'area', ok: false, text: `Too large for a field: ${size}` }
          : { id: 'area', ok: true, text: `Area: ${size}` },
    ];
  }

  private paintChecks(): DrawCheck[] {
    const state = this.paintState();
    if (state.cells === 0) {
      return [{ id: 'cells', ok: false, text: 'Paint at least one square' }];
    }
    return [
      state.regions > 1
        ? {
            id: 'regions',
            ok: false,
            text: `Your squares form ${state.regions} separate areas: join them or erase one`,
            action: 'Keep the largest area',
          }
        : { id: 'regions', ok: true, text: 'Single area' },
      { id: 'area', ok: true, text: `Area: ${formatHa(state.areaHa)}` },
    ];
  }

  private traceHint(): MapHint {
    const count = this.points().length;
    if (count === 0) {
      return this.zoom() < TRACE_MIN_ZOOM
        ? { text: 'Search for your farm above or zoom in on the map', tone: 'info' }
        : { text: 'Tap the corners of your field', tone: 'info' };
    }
    const selected = this.selected();
    if (selected !== null) {
      return {
        text: `Tap the map to add a corner after corner ${selected + 1}`,
        tone: 'info',
      };
    }
    if (count < MIN_VERTICES) {
      const missing = this.missing();
      return {
        text: `Good: tap ${missing} more ${missing === 1 ? 'corner' : 'corners'}`,
        tone: 'info',
      };
    }
    const problem = this.checks().find((check) => !check.ok);
    return problem
      ? { text: problem.text, tone: 'warn' }
      : { text: 'Done: you can save now', tone: 'ok' };
  }

  private paintHint(): MapHint {
    const tool = this.activeTool();
    if (tool === 'eraser') return { text: 'Drag to erase squares', tone: 'info' };
    if (tool === 'hand') return { text: 'Drag to move the map', tone: 'info' };
    const state = this.paintState();
    if (state.cells === 0) {
      return {
        text: this.coarse
          ? 'Paint with one finger · two fingers move the map'
          : 'Drag to paint · Space: move the map',
        tone: 'info',
      };
    }
    const problem = this.checks().find((check) => !check.ok);
    return problem
      ? { text: problem.text, tone: 'warn' }
      : { text: 'Done: you can save now', tone: 'ok' };
  }

  // --- mapa

  private initMap(): void {
    const map = L.map(this.mapElement().nativeElement, {
      doubleClickZoom: false,
      boxZoom: false,
      zoomControl: false,
    });
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' },
    ).addTo(map);
    // los rótulos ayudan a reconocer pueblos y rutas sobre la imagen
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Labels &copy; Esri' },
    ).addTo(map);
    L.control
      .zoom({ position: 'bottomright', zoomInTitle: 'Zoom in', zoomOutTitle: 'Zoom out' })
      .addTo(map);
    this.startView(map);

    const style = getComputedStyle(map.getContainer());
    const token = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback;
    this.halo = L.polygon([], {
      color: DRAW_HALO,
      opacity: 0.45,
      weight: 7,
      fill: false,
      interactive: false,
    });
    this.polygon = L.polygon([], {
      color: token('--draw-line', DRAW_LINE),
      weight: 3,
      fillColor: token('--draw-fill', DRAW_FILL),
      fillOpacity: 0.32,
      interactive: false,
    });
    this.vertices = L.layerGroup();
    this.areaTag = L.marker([0, 0], {
      icon: L.divIcon({ className: 'area-tag', html: '<span></span>', iconSize: [0, 0] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 500,
    });
    this.paintLayer = new PaintLayer();
    this.paintLayer.setScene(this.paint.grid, this.paint.cells);
    this.pointer = new PaintPointer(map, {
      start: (latlng) => this.startStroke(latlng),
      move: (latlng) => this.strokeTo(latlng),
      end: () => this.endStroke(),
      cancel: () => {
        this.paint.cancelStroke();
        this.strokeLast = null;
        this.paintChanged();
      },
      hover: (latlng) => this.hover(latlng),
    });
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.dragging || this.mode() !== 'trace') return;
      if (map.getZoom() < TRACE_MIN_ZOOM) {
        this.flashMap('Zoom in closer to your field to mark its corners');
        return;
      }
      this.editor.add([e.latlng.lat, e.latlng.lng]);
      this.changed();
    });
    map.on('zoomend', () => this.zoom.set(map.getZoom()));
    map.on('moveend', () => this.reanchorGrid(map));
    this.map = map;
    this.fitDraft(map);
    if (this.startSpot) this.showMe(this.startSpot);
    this.render();
    this.mapReady.set(true);
    this.showExistingLots(map);
  }

  // con lat y lng en la dirección, zoom de campo ahí; si no, toda la región pampeana
  private startView(map: L.Map): void {
    const spot = this.startSpot;
    if (spot) map.setView([spot.lat, spot.lng], FIELD_ZOOM);
    // sin tamaño todavía (por ejemplo en las pruebas) fitBounds calcula un zoom inválido
    else if (map.getSize().x > 0) map.fitBounds(REGION_BOUNDS);
    else map.setView(REGION_CENTER, REGION_ZOOM);
    this.zoom.set(map.getZoom());
  }

  /** Muestra los lotes del productor como referencia (punteados, no clickeables). */
  private showExistingLots(map: L.Map): void {
    this.api.lots().subscribe({
      next: (lots: LotSummary[]) => {
        this.lots.set(lots);
        if (lots.length === 0) return;
        const layer = L.featureGroup(
          lots.map((lot) =>
            L.geoJSON(lot.geometry, { style: EXISTING_STYLE }).bindTooltip(lot.name, {
              sticky: true,
            }),
          ),
        ).addTo(map);
        layer.bringToBack();
        // sin borrador ni ubicación, el lote nuevo seguramente está cerca de los otros
        if (!this.hasDraft() && !this.startSpot && map.getSize().x > 0) {
          map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: FIELD_ZOOM });
        }
      },
      // Sin backend igual se puede dibujar: los lotes existentes son solo referencia
      error: () => undefined,
    });
  }

  private applyMode(mode: DrawMode, tool: PaintTool): void {
    const map = this.map;
    if (!map || !this.paintLayer || !this.polygon || !this.halo || !this.vertices) return;
    if (mode === 'paint') {
      this.halo.remove();
      this.polygon.remove();
      this.vertices.remove();
      if (!map.hasLayer(this.paintLayer)) this.paintLayer.addTo(map);
      this.pointer?.setEnabled(tool !== 'hand');
      if (tool === 'hand') map.dragging.enable();
      else map.dragging.disable();
    } else {
      this.pointer?.setEnabled(false);
      this.paintLayer.remove();
      this.halo.addTo(map);
      this.polygon.addTo(map);
      this.vertices.addTo(map);
      map.dragging.enable();
    }
    this.updateAreaTag();
  }

  private moveTo(center: L.LatLngTuple, zoom: number): void {
    if (!this.map) return;
    if (this.reducedMotion) this.map.setView(center, zoom);
    else this.map.flyTo(center, zoom, { duration: 0.8 });
  }

  // punto azul donde está el productor: no se guarda, solo orienta
  private showMe(spot: Spot): void {
    const map = this.map;
    if (!map) return;
    this.me ??= L.marker([spot.lat, spot.lng], {
      icon: L.divIcon({ className: 'me-dot', html: '<span></span>', iconSize: [18, 18] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: -1000,
    });
    this.me.setLatLng([spot.lat, spot.lng]).addTo(map);
  }

  private startStroke(latlng: L.LatLng): void {
    if (this.zoom() < PAINT_MIN_ZOOM) {
      this.flashMap('Zoom in to paint hectares');
      return;
    }
    this.paint.beginStroke(this.activeTool() === 'eraser' ? 'erase' : 'paint');
    this.strokeLast = null;
    this.strokeTo(latlng);
  }

  private strokeTo(latlng: L.LatLng): void {
    if (!this.paint.stroking) return;
    const cell = this.paint.cellAt([latlng.lat, latlng.lng]);
    const erasing = this.activeTool() === 'eraser';
    const fresh = erasing ? [] : this.unpainted(this.strokeLast, cell);
    if (this.paint.strokeTo(cell)) {
      this.paintLayer?.pop(fresh);
      this.paintChanged();
    }
    this.strokeLast = cell;
    this.paintLayer?.setGhost(cell, erasing ? 'erase' : 'paint');
  }

  private endStroke(): void {
    this.paint.endStroke();
    this.strokeLast = null;
    this.paintChanged();
  }

  private hover(latlng: L.LatLng | null): void {
    const cell =
      latlng && this.zoom() >= PAINT_MIN_ZOOM ? this.paint.cellAt([latlng.lat, latlng.lng]) : null;
    this.paintLayer?.setGhost(cell, this.activeTool() === 'eraser' ? 'erase' : 'paint');
  }

  // celdas del tramo que todavía no estaban pintadas: son las que hacen "pop"
  private unpainted(from: Cell | null, to: Cell): Cell[] {
    try {
      const path = from ? lineCells(from, to) : [to];
      return path.length > 64 ? [] : path.filter((cell) => !this.paint.cells.has(cell));
    } catch {
      return [];
    }
  }

  private reanchorGrid(map: L.Map): void {
    const center = map.getCenter();
    const [x, y] = this.paint.grid.frame.toLocal([center.lat, center.lng]);
    if (Math.hypot(x, y) > REANCHOR_M && this.paint.moveOrigin([center.lat, center.lng])) {
      this.paintChanged();
    }
  }

  private alignmentTarget(): { ring: [number, number][]; label: string } | null {
    const points = this.editor.points;
    if (points.length >= 2) {
      const frame = createLocalFrame(points[0]);
      return { ring: points.map((p) => frame.toLocal(p)), label: 'your boundary' };
    }
    const center = this.map?.getCenter();
    if (!center) return null;
    const frame = createLocalFrame([center.lat, center.lng]);
    let best: { lot: LotSummary; distance: number } | null = null;
    for (const lot of this.lots()) {
      const lotCenter = geometryCenter(lot.geometry);
      if (!lotCenter) continue;
      const distance = Math.hypot(...frame.toLocal(lotCenter));
      if (distance <= ALIGN_RADIUS_M && (!best || distance < best.distance)) {
        best = { lot, distance };
      }
    }
    if (!best) return null;
    const ring = geometryToLocalRings(frame, best.lot.geometry)[0] ?? [];
    return { ring, label: `“${best.lot.name}”` };
  }

  // esquinas de la caja de lo pintado, en [lat, lng]
  private paintBox(): L.LatLngTuple[] | null {
    const box = this.paint.cells.bounds();
    return box
      ? [
          vertexLatLng(this.paint.grid, [box.minI, box.minJ]),
          vertexLatLng(this.paint.grid, [box.maxI + 1, box.minJ]),
          vertexLatLng(this.paint.grid, [box.maxI + 1, box.maxJ + 1]),
          vertexLatLng(this.paint.grid, [box.minI, box.maxJ + 1]),
        ]
      : null;
  }

  // con un borrador, el mapa arranca sobre lo que se había marcado
  private fitDraft(map: L.Map): void {
    const latlngs: L.LatLngTuple[] =
      this.mode() === 'paint' || this.editor.points.length === 0
        ? (this.paintBox() ?? this.editor.points.map((p) => [...p] as L.LatLngTuple))
        : this.editor.points.map((p) => [...p] as L.LatLngTuple);
    if (latlngs.length === 0) return;
    const bounds = L.latLngBounds(latlngs);
    if (map.getSize().x > 0) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
    else map.setView(bounds.getCenter(), 16);
    this.zoom.set(map.getZoom());
  }

  // etiqueta flotante con las hectáreas, en el centro de lo marcado
  private updateAreaTag(): void {
    const map = this.map;
    const tag = this.areaTag;
    if (!map || !tag) return;
    let at: LatLng | null = null;
    let text = '';
    if (this.mode() === 'trace') {
      const points = this.editor.points;
      if (points.length >= MIN_VERTICES) {
        at = ringCentroid(points);
        text = formatHa(areaHa(points));
      }
    } else {
      const box = this.paintBox();
      if (box) {
        at = ringCentroid(box.map(([lat, lng]) => [lat, lng] as LatLng));
        text = formatHa(this.paint.areaHa());
      }
    }
    if (!at) {
      tag.remove();
      return;
    }
    tag.setLatLng(at);
    if (!map.hasLayer(tag)) tag.addTo(map);
    const label = tag.getElement()?.querySelector('span');
    if (label) label.textContent = text;
  }

  private flashMap(message: string): void {
    this.mapNotice.set(message);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.mapNotice.set(null), MAP_NOTICE_MS);
  }

  private navigateLater(commands: unknown[], delay: number, extras?: NavigationExtras): void {
    this.navigateTimer = setTimeout(
      () => void (extras ? this.router.navigate(commands, extras) : this.router.navigate(commands)),
      delay,
    );
  }

  private paintChanged(): void {
    this.paintRevision.update((n) => n + 1);
    this.paintLayer?.setScene(this.paint.grid, this.paint.cells);
    if (this.mode() === 'paint') this.updateAreaTag();
  }

  private changed(): void {
    this.revision.update((n) => n + 1);
    this.render();
  }

  private scheduleDraft(): void {
    if (this.finished) return;
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.writeDraft(), DRAFT_SAVE_MS);
  }

  private writeDraft(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    if (this.finished) return;
    if (!this.hasDraft()) {
      this.removeDraft();
      return;
    }
    const draft: LotDraft = {
      v: 1,
      mode: this.mode(),
      paint: this.paint.snapshot(),
      points: this.editor.points.map((p) => [...p] as LatLng),
      name: this.name(),
      locality: this.locality(),
      province: this.province(),
      renspa: this.renspa(),
      savedAt: new Date().toISOString(),
    };
    try {
      this.storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // sin lugar en el dispositivo el borrador vive solo en esta pestaña
    }
  }

  private removeDraft(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    try {
      this.storage.removeItem(DRAFT_KEY);
    } catch {
      // nada que limpiar
    }
  }

  private render(): void {
    if (!this.polygon || !this.halo || !this.vertices) return;
    const points = this.editor.points;
    const latlngs = points.map((p) => [...p] as L.LatLngTuple);
    this.polygon.setLatLngs(latlngs);
    this.halo.setLatLngs(latlngs);
    this.vertices.clearLayers();
    points.forEach((point, index) => {
      const marker = L.marker(point, {
        draggable: true,
        icon: vertexIcon(index, index === this.editor.selected),
        keyboard: false,
        zIndexOffset: 1000,
      })
        .on('click', () => {
          // tocar la primera esquina para "cerrar" no cambia nada: la forma ya se cierra sola
          if (
            index === 0 &&
            this.editor.points.length >= MIN_VERTICES &&
            this.selected() === null
          ) {
            this.flashMap('The shape is already closed: you can save or keep adding corners');
            return;
          }
          this.selectVertex(index);
        })
        .on('contextmenu', (e: L.LeafletMouseEvent) => {
          e.originalEvent.preventDefault();
          this.removeVertex(index);
        })
        .on('dragstart', () => (this.dragging = true))
        .on('drag', () => {
          const live = this.editor.points.map((p) => [...p] as L.LatLngTuple);
          const { lat, lng } = marker.getLatLng();
          live[index] = [lat, lng];
          this.polygon?.setLatLngs(live);
          this.halo?.setLatLngs(live);
        })
        .on('dragend', () => {
          const { lat, lng } = marker.getLatLng();
          this.editor.move(index, [lat, lng]);
          this.changed();
          // Leaflet dispara un clic en el mapa al soltar: se ignora un instante
          setTimeout(() => (this.dragging = false), 150);
        });
      marker.addTo(this.vertices!);
    });
    this.updateAreaTag();
  }
}

function vertexIcon(index: number, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: selected ? 'vertex vertex--selected' : 'vertex',
    html: `<span>${index + 1}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function formatHa(hectares: number): string {
  return `${hectares.toLocaleString('en-US', { maximumFractionDigits: 1 })} ha`;
}

function describeSaveError(err: unknown): string {
  const message = describeBackendError(err);
  return message ? `Couldn't save the field: ${message}` : "Couldn't save the field. Try again.";
}

function formatDegrees(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}°`;
}

function isTypingTarget(target: HTMLElement | null): boolean {
  return (
    !!target &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  );
}

// con el foco en un botón o un enlace la barra espaciadora los activa: no se la roba la mano
function isControl(target: HTMLElement | null): boolean {
  return !!target && ['BUTTON', 'A', 'SUMMARY'].includes(target.tagName);
}

/** lee el borrador guardado, o null si no hay o no sirve */
function readDraft(storage: Pick<Storage, 'getItem'>): LotDraft | null {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<LotDraft> | null;
    if (!draft || draft.v !== 1) return null;
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    const points = Array.isArray(draft.points)
      ? draft.points.filter(
          (p): p is LatLng =>
            Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n)),
        )
      : [];
    return {
      v: 1,
      mode: draft.mode === 'paint' ? 'paint' : 'trace',
      paint: draft.paint as PaintSnapshot,
      points,
      name: text(draft.name),
      locality: text(draft.locality),
      province: text(draft.province),
      renspa: text(draft.renspa),
      savedAt: text(draft.savedAt),
    };
  } catch {
    return null;
  }
}
