import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { LotSummary, PolygonGeometry } from '../../../core/models';

/** un lote para la vista satelital: los del backend y los que esperan sincronizar */
export interface SatelliteLot {
  id: string;
  name: string;
  geometry: PolygonGeometry;
  pending?: boolean;
}

export function satelliteLotOf(lot: LotSummary): SatelliteLot {
  return { id: String(lot.id), name: lot.name, geometry: lot.geometry };
}

// sin lotes todavía, una vista amplia de la región pampeana: la vista se ajusta a los lotes
const DEFAULT_CENTER: L.LatLngTuple = [-34.5, -61.25];
const DEFAULT_ZOOM = 6;
const STYLE: L.PathOptions = {
  color: '#f3e3ae',
  weight: 2,
  fillColor: '#8fcf7c',
  fillOpacity: 0.25,
};
const SELECTED: L.PathOptions = { color: '#f2a43a', weight: 4, fillOpacity: 0.35 };
const PENDING: L.PathOptions = { color: '#e8eef5', weight: 2, dashArray: '6 5', fillOpacity: 0.1 };

/** los lotes sobre imagen satelital real (Esri) o calles (OpenStreetMap), con Leaflet */
@Component({
  selector: 'app-satellite-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #map class="map" role="region" aria-label="Mapa satelital de los lotes"></div>`,
  styles: `
    :host {
      position: relative;
      display: block;
      min-height: 20rem;
    }
    .map {
      position: absolute;
      inset: 0;
      background: #1b2f44;
    }
    /* el + y el − de leaflet miden 30 px: con el dedo, 44 px como el resto de los toques */
    @media (pointer: coarse) {
      :host ::ng-deep .leaflet-control-zoom a {
        width: var(--tap);
        height: var(--tap);
        line-height: var(--tap);
      }
    }
  `,
})
export class SatelliteView {
  readonly lots = input<readonly SatelliteLot[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly lotSelect = output<string | null>();
  readonly lotOpen = output<string>();

  private readonly mapElement = viewChild.required<ElementRef<HTMLElement>>('map');
  private map: L.Map | null = null;
  private layer: L.FeatureGroup | null = null;
  private readonly polygons = new Map<string, L.GeoJSON>();
  private fitted = false;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly reducedMotion =
    inject(DOCUMENT).defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor() {
    afterNextRender(() => this.init());
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.resizeTimer);
      this.map?.remove();
    });
    effect(() => {
      const lots = this.lots();
      untracked(() => this.draw(lots));
    });
    effect(() => {
      const selected = this.selectedId();
      untracked(() => this.highlight(selected));
    });
  }

  private init(): void {
    const map = L.map(this.mapElement().nativeElement, { zoomControl: false }).setView(
      DEFAULT_CENTER,
      DEFAULT_ZOOM,
    );
    // el zoom va abajo a la derecha: arriba a la izquierda queda el selector de vista
    L.control
      .zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' })
      .addTo(map);
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics' },
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
        { Rótulos: labels },
        { position: 'topright' },
      )
      .addTo(map);
    map.on('click', () => this.lotSelect.emit(null));
    this.layer = L.featureGroup().addTo(map);
    this.map = map;
    this.draw(this.lots());
    // la vista puede haber cambiado de tamaño al mostrarse
    this.resizeTimer = setTimeout(() => map.invalidateSize(), 0);
  }

  private draw(lots: readonly SatelliteLot[]): void {
    const layer = this.layer;
    if (!layer || !this.map) return;
    layer.clearLayers();
    this.polygons.clear();
    for (const lot of lots) {
      const polygon = L.geoJSON(lot.geometry, { style: lot.pending ? PENDING : STYLE })
        .bindTooltip(lot.pending ? `${lot.name} · sin sincronizar` : lot.name, { sticky: true })
        .on('click', (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          this.lotSelect.emit(lot.id);
        })
        .on('dblclick', (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          if (!lot.pending) this.lotOpen.emit(lot.id);
        });
      polygon.addTo(layer);
      this.polygons.set(lot.id, polygon);
    }
    if (!this.fitted && lots.length > 0) {
      this.map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 15 });
      this.fitted = true;
    }
    this.highlight(this.selectedId());
  }

  private highlight(selected: string | null): void {
    for (const [id, polygon] of this.polygons) {
      const lot = this.lots().find((item) => item.id === id);
      polygon.setStyle(id === selected ? SELECTED : lot?.pending ? PENDING : STYLE);
      if (id === selected) polygon.bringToFront();
    }
    const target = selected ? this.polygons.get(selected) : null;
    if (target && this.map) {
      // con prefers-reduced-motion se salta al lote sin el vuelo animado
      if (this.reducedMotion) {
        this.map.fitBounds(target.getBounds(), { padding: [60, 60], maxZoom: 16, animate: false });
      } else {
        this.map.flyToBounds(target.getBounds(), { padding: [60, 60], maxZoom: 16, duration: 0.6 });
      }
    }
  }
}
