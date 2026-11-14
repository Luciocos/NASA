import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';

import { Api } from '../../../core/api';
import { LotSummary } from '../../../core/models';
import { areaHa, toPolygonGeometry } from '../geo';
import { LatLng, MIN_VERTICES, PolygonEditor } from '../polygon-editor';

const DEFAULT_CENTER: L.LatLngTuple = [-33.05, -61.2];
const DEFAULT_ZOOM = 13;
const STROKE = '#1b6e3a';
const EXISTING_STYLE: L.PathOptions = {
  color: '#ffffff',
  weight: 2,
  dashArray: '6 4',
  fillOpacity: 0.08,
  interactive: false,
};

/**
 * Alta de un lote dibujando su perímetro sobre imagen satelital (CLAUDE.md, sección 2:
 * "un polígono alcanza para obtener un resultado").
 *
 * Clic en el mapa agrega un vértice. Clic en un vértice lo selecciona y el próximo clic inserta
 * a su lado. Arrastrar mueve, clic derecho borra. Ctrl+Z y Ctrl+Y deshacen y rehacen.
 */
@Component({
  imports: [RouterLink],
  selector: 'app-lot-draw',
  styleUrl: './lot-draw.css',
  templateUrl: './lot-draw.html',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class LotDraw {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly mapElement = viewChild.required<ElementRef<HTMLElement>>('map');

  private readonly editor = new PolygonEditor();
  // Cambia en cada edición para que las señales derivadas del editor se recalculen
  private readonly revision = signal(0);

  protected readonly points = computed(() => (this.revision(), [...this.editor.points]));
  protected readonly selected = computed(() => (this.revision(), this.editor.selected));
  protected readonly canUndo = computed(() => (this.revision(), this.editor.canUndo));
  protected readonly canRedo = computed(() => (this.revision(), this.editor.canRedo));
  protected readonly missing = computed(() => (this.revision(), this.editor.missingVertices));
  protected readonly area = computed(() => areaHa(this.points()));
  protected readonly minVertices = MIN_VERTICES;

  protected readonly name = signal('');
  protected readonly locality = signal('');
  protected readonly province = signal('');
  protected readonly renspa = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canSave = computed(
    () => this.missing() === 0 && this.name().trim() !== '' && !this.saving(),
  );

  private map: L.Map | null = null;
  private polygon: L.Polygon | null = null;
  private vertices: L.LayerGroup | null = null;
  private dragging = false;

  constructor() {
    afterNextRender(() => this.initMap());
    inject(DestroyRef).onDestroy(() => this.map?.remove());
  }

  protected undo(): void {
    this.editor.undo();
    this.changed();
  }

  protected redo(): void {
    this.editor.redo();
    this.changed();
  }

  protected clear(): void {
    this.editor.clear();
    this.changed();
  }

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

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      this.redo();
    }
  }

  protected save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api
      .createLot({
        name: this.name().trim(),
        locality: this.locality().trim(),
        province: this.province().trim(),
        renspa: this.renspa().trim() || null,
        geometry: toPolygonGeometry(this.points()),
      })
      .subscribe({
        next: (lot) => this.router.navigate(['/lotes', lot.id]),
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(describeError(err));
        },
      });
  }

  protected formatArea(hectares: number): string {
    return `${hectares.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ha`;
  }

  protected formatCoord(value: number): string {
    return value.toFixed(6);
  }

  private initMap(): void {
    const map = L.map(this.mapElement().nativeElement, { doubleClickZoom: false });
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
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    this.polygon = L.polygon([], { color: STROKE, weight: 3, fillOpacity: 0.3 }).addTo(map);
    this.vertices = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.dragging) return;
      this.editor.add([e.latlng.lat, e.latlng.lng]);
      this.changed();
    });
    this.map = map;
    this.showExistingLots(map);
  }

  /** Muestra los lotes ya cargados como referencia (punteados, no clickeables). */
  private showExistingLots(map: L.Map): void {
    this.api.lots().subscribe({
      next: (lots: LotSummary[]) => {
        if (lots.length === 0) return;
        const layer = L.featureGroup(
          lots.map((lot) =>
            L.geoJSON(lot.geometry, { style: EXISTING_STYLE }).bindTooltip(lot.name, {
              sticky: true,
            }),
          ),
        ).addTo(map);
        layer.bringToBack();
        if (this.editor.points.length === 0) {
          map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 14 });
        }
      },
      // Sin backend igual se puede dibujar: los lotes existentes son solo referencia
      error: () => undefined,
    });
  }

  private changed(): void {
    this.revision.update((n) => n + 1);
    this.render();
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

function describeError(err: HttpErrorResponse): string {
  if (err.status === 0) return 'No hay conexión con el backend. Intentá de nuevo en un momento.';
  const body = err.error as Record<string, unknown> | null;
  if (body && typeof body === 'object') {
    const messages = Object.values(body).flatMap((v) => (Array.isArray(v) ? v : [v]));
    const text = messages.filter((m) => typeof m === 'string').join(' ');
    if (text) return `No se pudo guardar el lote: ${text}`;
  }
  return 'No se pudo guardar el lote. Intentá de nuevo.';
}
