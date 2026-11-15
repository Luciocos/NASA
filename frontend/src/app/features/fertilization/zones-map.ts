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
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { PolygonGeometry } from '../../core/models';
import { MODIS_CELL_M, NdviPixel, NdviZones, isMixedPixel } from '../../core/nasa';
import { renderBlend } from './ndvi-blend';

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
      min-height: 16rem;
    }
    /* las esquinas las pone quien lo contiene (la tarjeta a sangre las recorta) */
    .map {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--night-900, #1b2f44);
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
export class ZonesMap {
  readonly geometry = input.required<PolygonGeometry>();
  readonly zones = input<NdviZones | null>(null);

  private readonly element = viewChild.required<ElementRef<HTMLElement>>('map');
  private readonly document = inject(DOCUMENT);
  private map: L.Map | null = null;
  private layer: L.LayerGroup | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterNextRender(() => {
      // en el celular un dedo desliza la pantalla, no el mapa (se acerca con dos dedos): el lote
      // ya entra encuadrado y así el mapa no atrapa el scroll
      const map = L.map(this.element().nativeElement, {
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
      });
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics' },
      ).addTo(map);
      this.layer = L.layerGroup().addTo(map);
      this.map = map;
      this.draw();
      this.resizeTimer = setTimeout(() => map.invalidateSize(), 0);
    });
    inject(DestroyRef).onDestroy(() => {
      // si se destruye antes del timeout, invalidateSize correría sobre un mapa ya quitado
      clearTimeout(this.resizeTimer);
      this.map?.remove();
    });
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
    // degradado suave entre ambientes, recortado al lote (solo visual: los números son por cuadro)
    const blend = renderBlend(this.zones(), this.geometry(), MODIS_CELL_M, this.document);
    if (blend) {
      L.imageOverlay(blend.url, blend.bounds, {
        interactive: false,
        className: 'ndvi-blend',
      }).addTo(layer);
    }
    for (const zone of this.zones()?.zones ?? []) {
      const style = ZONE_STYLE[zone.level];
      for (const pixel of zone.pixels) {
        // solo la parte del píxel dentro del lote; una grilla sin recorte dibuja el píxel entero
        const shape = pixel.clip?.length ? pixel.clip : pixel.ring;
        const mixed = isMixedPixel(pixel);
        // con degradado, el cuadro queda invisible y solo sirve para la ayuda al pasar el mouse;
        // sin canvas (navegadores viejos) se dibuja como antes, plano y con trazo por ambiente
        L.polygon(shape, {
          color: style.color,
          weight: blend ? 0 : 1.5,
          opacity: blend ? 0 : 1,
          dashArray: style.dash,
          fillColor: style.fill,
          // el píxel mixto va más claro; la ayuda y la leyenda dicen qué significa
          fillOpacity: blend ? 0 : mixed ? 0.2 : 0.55,
        })
          .bindTooltip(pixelTooltip(zone.label, pixel, mixed))
          .addTo(layer);
      }
    }
    const outline = L.geoJSON(this.geometry(), {
      style: { color: '#f2a43a', weight: 3, fill: false },
    }).addTo(layer);
    map.fitBounds(outline.getBounds(), { padding: [30, 30], maxZoom: 16 });
  }
}

const formatter = (digits: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits });

/** ayuda de un píxel: NDVI, hectáreas en el lote y, si es mixto, qué parte del cuadro es del lote */
export function pixelTooltip(label: string, pixel: NdviPixel, mixed: boolean): string {
  const parts = [`${label}: NDVI ${formatter(2).format(pixel.value ?? 0)}`];
  if (pixel.insideHa) parts.push(`${formatter(1).format(pixel.insideHa)} ha en el lote`);
  const share = pixel.insideShare;
  // un cuadro casi entero ("100 %" redondeado) no necesita la aclaración
  if (share !== undefined && Math.round(share * 100) < 100) {
    const percent = `${formatter(0).format(share * 100)} % del cuadro está en tu lote`;
    parts.push(
      mixed
        ? `Píxel mixto: solo el ${percent}; el valor refleja sobre todo lo que hay alrededor`
        : `el ${percent}`,
    );
  }
  return parts.join(' · ');
}
