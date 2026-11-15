import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { PolygonGeometry } from '../../../core/models';
import { PeriurbanGeometry } from './periurban.types';

/** estilo de cada capa: además del color cambia el trazo, para no depender solo del color */
export const PERIURBAN_STYLE = {
  aerial: { color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.18, dashArray: '6 4' },
  terrestrial: { color: '#9a1c1c', fillColor: '#dc2626', fillOpacity: 0.28, dashArray: '2 4' },
  urban: { color: '#374151', fillColor: '#6b7280', fillOpacity: 0.45, dashArray: undefined },
  lot: { color: '#1d4ed8', weight: 3, fill: false },
} as const;

/** mini mapa: el lote, el área urbana aproximada y las franjas de exclusión */
@Component({
  selector: 'app-periurban-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    #map
    class="map"
    role="region"
    aria-label="Map of the field and the peri-urban exclusion buffers"
  ></div>`,
  styles: `
    :host {
      position: relative;
      display: block;
      min-height: 15rem;
    }
    .map {
      position: absolute;
      inset: 0;
      border-radius: 6px;
      background: #e5e7eb;
    }
  `,
})
export class PeriurbanMap {
  readonly lotGeometry = input.required<PolygonGeometry>();
  readonly zones = input.required<PeriurbanGeometry>();

  private readonly element = viewChild.required<ElementRef<HTMLElement>>('map');
  private map: L.Map | null = null;
  private layer: L.LayerGroup | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterNextRender(() => {
      const map = L.map(this.element().nativeElement, {
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      this.layer = L.layerGroup().addTo(map);
      this.map = map;
      this.draw();
      this.resizeTimer = setTimeout(() => map.invalidateSize(), 0);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.resizeTimer);
      this.map?.remove();
    });
    effect(() => {
      this.lotGeometry();
      this.zones();
      untracked(() => this.draw());
    });
  }

  private draw(): void {
    const map = this.map;
    const layer = this.layer;
    if (!map || !layer) return;
    layer.clearLayers();
    const zones = this.zones();
    const add = (
      geometry: GeoJSON.Geometry | null,
      style: L.PathOptions,
      tooltip: string,
    ): L.GeoJSON | null => {
      if (!geometry) return null;
      return L.geoJSON(geometry, { style: { weight: 1.5, ...style } })
        .bindTooltip(tooltip)
        .addTo(layer);
    };
    // de la franja más ancha a la más angosta, para que se vean superpuestas
    add(zones.aerial, PERIURBAN_STYLE.aerial, 'Aerial spraying buffer');
    add(zones.terrestrial, PERIURBAN_STYLE.terrestrial, 'Ground spraying buffer');
    add(zones.urban, PERIURBAN_STYLE.urban, 'Approximate urban area (OpenStreetMap)');
    const outline = L.geoJSON(this.lotGeometry(), { style: PERIURBAN_STYLE.lot })
      .bindTooltip('Field')
      .addTo(layer);
    map.fitBounds(outline.getBounds().pad(1.2), { maxZoom: 15 });
  }
}
