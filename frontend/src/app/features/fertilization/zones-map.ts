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

import { PolygonGeometry } from '../../core/models';
import { NdviZones } from '../../core/nasa';

/** color y trazo de cada ambiente: el borde cambia además del color */
export const ZONE_STYLE = {
  alto: { color: '#1b6e3a', fill: '#3d9a4f', dash: undefined },
  medio: { color: '#8a5a00', fill: '#dcb651', dash: '6 4' },
  bajo: { color: '#6b4429', fill: '#c9a27c', dash: '2 4' },
} as const;

/** el lote sobre imagen satelital con sus píxeles de NDVI pintados por ambiente */
@Component({
  selector: 'app-zones-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #map class="map" role="region" aria-label="Mapa de ambientes por NDVI"></div>`,
  styles: `
    :host {
      position: relative;
      display: block;
      min-height: 22rem;
    }
    .map {
      position: absolute;
      inset: 0;
      border-radius: var(--radius-lg);
      background: #1b2f44;
    }
  `,
})
export class ZonesMap {
  readonly geometry = input.required<PolygonGeometry>();
  readonly zones = input<NdviZones | null>(null);

  private readonly element = viewChild.required<ElementRef<HTMLElement>>('map');
  private map: L.Map | null = null;
  private layer: L.LayerGroup | null = null;

  constructor() {
    afterNextRender(() => {
      const map = L.map(this.element().nativeElement, { scrollWheelZoom: false });
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics' },
      ).addTo(map);
      this.layer = L.layerGroup().addTo(map);
      this.map = map;
      this.draw();
      setTimeout(() => map.invalidateSize(), 0);
    });
    inject(DestroyRef).onDestroy(() => this.map?.remove());
    effect(() => {
      this.geometry();
      this.zones();
      untracked(() => this.draw());
    });
  }

  private draw(): void {
    const map = this.map;
    const layer = this.layer;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const zone of this.zones()?.zones ?? []) {
      const style = ZONE_STYLE[zone.level];
      for (const pixel of zone.pixels) {
        L.polygon(pixel.ring, {
          color: style.color,
          weight: 1.5,
          dashArray: style.dash,
          fillColor: style.fill,
          fillOpacity: 0.55,
        })
          .bindTooltip(`${zone.label}: NDVI ${pixel.value?.toLocaleString('es-AR')}`)
          .addTo(layer);
      }
    }
    const outline = L.geoJSON(this.geometry(), {
      style: { color: '#f2a43a', weight: 3, fill: false },
    }).addTo(layer);
    map.fitBounds(outline.getBounds(), { padding: [30, 30], maxZoom: 16 });
  }
}
