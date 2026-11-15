import {
  Component,
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
import { Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';

import { DemoAccount } from '../../../core/account/demo-account';
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
import { Icon } from '../../../shared/ui/icon/icon';
import { areaHa, toPolygonGeometry } from '../geo';
import { Cell, lineCells, vertexLatLng } from '../grid';
import {
  PAINT_MIN_ZOOM,
  PaintCellSize,
  PaintHud,
  PaintLayer,
  PaintPointer,
  PaintScore,
  PaintSession,
  PaintSnapshot,
  PaintTool,
  PaintTutorial,
  gridAngleFor,
  longestSideDeg,
} from '../paint';
import { LatLng, MIN_VERTICES, PolygonEditor } from '../polygon-editor';

const DEFAULT_CENTER: [number, number] = [-33.05, -61.2];
const DEFAULT_ZOOM = 15;
const STROKE = '#1b6e3a';
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

/**
 * alta de un lote sobre imagen satelital (CLAUDE.md, sección 2: "un polígono alcanza para
 * obtener un resultado"), con dos modos:
 *
 * - pintar hectáreas (por defecto): se pintan recuadros de 1 ha o ¼ ha arrastrando sobre una
 *   grilla que se puede girar para seguir los alambrados
 * - trazar perímetro: clic en el mapa agrega un vértice; clic en un vértice lo selecciona y el
 *   próximo clic inserta a su lado; arrastrar mueve y clic derecho borra
 *
 * cada modo conserva lo suyo al cambiar. lo marcado y el formulario quedan como borrador en el
 * dispositivo hasta guardar o descartarlo
 */
@Component({
  imports: [RouterLink, Icon, PaintHud, PaintScore, PaintTutorial],
  selector: 'app-lot-draw',
  styleUrl: './lot-draw.css',
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
  private readonly account = inject(DemoAccount);
  private readonly router = inject(Router);
  private readonly storage = inject(OFFLINE_STORAGE);
  private readonly mapElement = viewChild.required<ElementRef<HTMLElement>>('map');

  private readonly draft = readDraft(this.storage);

  // --- trazar perímetro
  private editor = new PolygonEditor(this.draft?.points ?? []);
  // Cambia en cada edición para que las señales derivadas del editor se recalculen
  private readonly revision = signal(0);

  protected readonly points = computed(() => (this.revision(), [...this.editor.points]));
  protected readonly selected = computed(() => (this.revision(), this.editor.selected));
  protected readonly canUndo = computed(() => (this.revision(), this.editor.canUndo));
  protected readonly canRedo = computed(() => (this.revision(), this.editor.canRedo));
  protected readonly missing = computed(() => (this.revision(), this.editor.missingVertices));
  protected readonly area = computed(() => areaHa(this.points()));
  protected readonly minVertices = MIN_VERTICES;

  // --- pintar hectáreas
  private paint = PaintSession.restore(this.draft?.paint) ?? new PaintSession(DEFAULT_CENTER);
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

  protected readonly mode = signal<DrawMode>(this.draft?.mode ?? 'paint');
  protected readonly tool = signal<PaintTool>('brush');
  /** barra espaciadora apretada: mano mientras dure */
  protected readonly spaceHand = signal(false);
  protected readonly activeTool = computed<PaintTool>(() =>
    this.spaceHand() ? 'hand' : this.tool(),
  );
  protected readonly zoom = signal(DEFAULT_ZOOM);
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
  protected readonly canSave = computed(() => {
    if (this.saving() || this.name().trim() === '') return false;
    return this.mode() === 'paint' ? this.paintState().regions === 1 : this.missing() === 0;
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
  private vertices: L.LayerGroup | null = null;
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
    this.pointer?.finish();
    this.mode.set(mode);
    this.error.set(null);
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

  protected clear(): void {
    if (this.mode() === 'paint') {
      if (this.paint.clear()) this.paintChanged();
      return;
    }
    this.editor.clear();
    this.changed();
  }

  // --- trazar perímetro

  protected deselect(): void {
    this.editor.deselect();
    this.changed();
  }

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
      this.flashMap(
        'No hay un lote cerca para alinear: acercate a uno o trazá un lado en «Trazar perímetro»',
      );
      return;
    }
    const angle = gridAngleFor(side);
    this.paint.setGrid({ rotationDeg: angle });
    this.paintChanged();
    this.flashMap(`Grilla alineada con ${target.label}: ${formatDegrees(angle)}`);
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
    if (this.mode() !== 'paint' || event.altKey) return;
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
    this.paint = new PaintSession(center ? [center.lat, center.lng] : DEFAULT_CENTER);
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
      this.error.set(err instanceof Error ? err.message : 'No se pudo armar el polígono.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.outbox
      .createOrQueue({
        name: this.name().trim(),
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
            this.account.addLot(result.lot.id);
            this.notice.set(`Listo: guardamos «${result.lot.name}». Abrimos su ficha…`);
            this.navigateLater(['/lotes', result.lot.id], CREATED_NOTICE_MS);
          } else {
            // la cola lo suma a la cuenta demo cuando lo sube
            this.notice.set(
              'Guardamos el lote en este dispositivo: se sube solo cuando vuelva la conexión',
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
    return `${hectares.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ha`;
  }

  protected formatCoord(value: number): string {
    return value.toFixed(6);
  }

  // --- mapa

  private initMap(): void {
    const map = L.map(this.mapElement().nativeElement, {
      doubleClickZoom: false,
      boxZoom: false,
      zoomControl: false,
    });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics',
      },
    );
    const labels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Rótulos &copy; Esri' },
    );
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    satellite.addTo(map);
    labels.addTo(map);
    L.control
      .layers(
        { Satelital: satellite, Calles: streets },
        { 'Rótulos y localidades': labels },
        { position: 'topright' },
      )
      .addTo(map);
    L.control
      .zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' })
      .addTo(map);
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    this.polygon = L.polygon([], { color: STROKE, weight: 3, fillOpacity: 0.3 });
    this.vertices = L.layerGroup();
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
      this.editor.add([e.latlng.lat, e.latlng.lng]);
      this.changed();
    });
    map.on('zoomend', () => this.zoom.set(map.getZoom()));
    map.on('moveend', () => this.reanchorGrid(map));
    this.map = map;
    this.fitDraft(map);
    this.render();
    this.mapReady.set(true);
    this.showExistingLots(map);
  }

  /** Muestra los lotes ya cargados como referencia (punteados, no clickeables). */
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
        if (!this.hasDraft()) {
          map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: DEFAULT_ZOOM });
        }
      },
      // Sin backend igual se puede dibujar: los lotes existentes son solo referencia
      error: () => undefined,
    });
  }

  private applyMode(mode: DrawMode, tool: PaintTool): void {
    const map = this.map;
    if (!map || !this.paintLayer || !this.polygon || !this.vertices) return;
    if (mode === 'paint') {
      this.polygon.remove();
      this.vertices.remove();
      if (!map.hasLayer(this.paintLayer)) this.paintLayer.addTo(map);
      this.pointer?.setEnabled(tool !== 'hand');
      if (tool === 'hand') map.dragging.enable();
      else map.dragging.disable();
    } else {
      this.pointer?.setEnabled(false);
      this.paintLayer.remove();
      this.polygon.addTo(map);
      this.vertices.addTo(map);
      map.dragging.enable();
    }
  }

  private startStroke(latlng: L.LatLng): void {
    if (this.zoom() < PAINT_MIN_ZOOM) {
      this.flashMap('Acercate para pintar hectáreas');
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
      return { ring: points.map((p) => frame.toLocal(p)), label: 'tu perímetro' };
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
    return { ring, label: `«${best.lot.name}»` };
  }

  // con un borrador, el mapa arranca sobre lo que se había marcado
  private fitDraft(map: L.Map): void {
    const box = this.paint.cells.bounds();
    const latlngs: L.LatLngTuple[] = box
      ? [
          vertexLatLng(this.paint.grid, [box.minI, box.minJ]),
          vertexLatLng(this.paint.grid, [box.maxI + 1, box.minJ]),
          vertexLatLng(this.paint.grid, [box.maxI + 1, box.maxJ + 1]),
          vertexLatLng(this.paint.grid, [box.minI, box.maxJ + 1]),
        ]
      : this.editor.points.map((p) => [...p] as L.LatLngTuple);
    if (latlngs.length === 0) return;
    const bounds = L.latLngBounds(latlngs);
    // sin tamaño todavía (por ejemplo en las pruebas) fitBounds calcula un zoom inválido
    if (map.getSize().x > 0) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
    else map.setView(bounds.getCenter(), 16);
    this.zoom.set(map.getZoom());
  }

  private flashMap(message: string): void {
    this.mapNotice.set(message);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.mapNotice.set(null), MAP_NOTICE_MS);
  }

  private navigateLater(commands: unknown[], delay: number): void {
    this.navigateTimer = setTimeout(() => void this.router.navigate(commands), delay);
  }

  private paintChanged(): void {
    this.paintRevision.update((n) => n + 1);
    this.paintLayer?.setScene(this.paint.grid, this.paint.cells);
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
    if (!this.polygon || !this.vertices) return;
    const points = this.editor.points;
    this.polygon.setLatLngs(points.map((p) => [...p] as L.LatLngTuple));
    this.vertices.clearLayers();
    points.forEach((point, index) => {
      const marker = L.marker(point, {
        draggable: true,
        icon: vertexIcon(index, index === this.editor.selected),
        keyboard: false,
      })
        .bindTooltip(
          index === this.editor.selected
            ? `Vértice ${index + 1} seleccionado: el próximo clic inserta a su lado`
            : `Vértice ${index + 1}: clic para seleccionar, arrastrar para mover, clic derecho para borrar`,
          { direction: 'top', offset: [0, -14] },
        )
        .on('click', () => this.selectVertex(index))
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
  }
}

function vertexIcon(index: number, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: selected ? 'vertex vertex--selected' : 'vertex',
    html: `<span>${index + 1}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function describeSaveError(err: unknown): string {
  const message = describeBackendError(err);
  return message
    ? `No se pudo guardar el lote: ${message}`
    : 'No se pudo guardar el lote. Intentá de nuevo.';
}

function formatDegrees(value: number): string {
  return `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}°`;
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
      mode: draft.mode === 'trace' ? 'trace' : 'paint',
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
