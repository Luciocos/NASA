import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';

import { Api } from '../../../core/api';
import { LotSummary } from '../../../core/models';

// Vista inicial si todavía no hay lotes: Zona Núcleo (sur de Santa Fe).
const DEFAULT_CENTER: L.LatLngTuple = [-33.05, -61.2];
const DEFAULT_ZOOM = 9;

const LOT_STYLE: L.PathOptions = { color: '#1a4f8b', weight: 3, fillOpacity: 0.2 };
const LOT_HOVER_STYLE: L.PathOptions = { weight: 5, fillOpacity: 0.35 };

/** Mapa de lotes (CLAUDE.md, sección 11, pantalla 1). Clic en un lote abre su ficha. */
@Component({
  imports: [RouterLink],
  selector: 'app-map-page',
  styleUrl: './map-page.css',
  templateUrl: './map-page.html',
})
export class MapPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly mapElement = viewChild.required<ElementRef<HTMLElement>>('map');

  protected readonly lots = signal<LotSummary[] | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly map = signal<L.Map | null>(null);

  constructor() {
    this.api.lots().subscribe({
      next: (lots) => this.lots.set(lots),
      error: () => this.error.set('No se pudieron cargar los lotes. ¿Está corriendo el backend?'),
    });

    afterNextRender(() => {
      const map = L.map(this.mapElement().nativeElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      this.map.set(map);
    });

    inject(DestroyRef).onDestroy(() => this.map()?.remove());

    effect(() => {
      const map = this.map();
      const lots = this.lots();
      if (map && lots) {
        this.drawLots(map, lots);
      }
    });
  }

  private drawLots(map: L.Map, lots: LotSummary[]): void {
    const layer = L.featureGroup().addTo(map);
    for (const lot of lots) {
      const polygon = L.geoJSON(lot.geometry, { style: LOT_STYLE })
        .bindTooltip(`${lot.name} · ${formatArea(lot.area_ha)}`, { sticky: true })
        .on('mouseover', () => polygon.setStyle(LOT_HOVER_STYLE))
        .on('mouseout', () => polygon.setStyle(LOT_STYLE))
        .on('click', () => this.router.navigate(['/lotes', lot.id]));
      polygon.addTo(layer);
    }
    if (lots.length > 0) {
      map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 15 });
    }
  }

  protected readonly formatArea = formatArea;
}

function formatArea(hectares: number): string {
  return `${hectares.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ha`;
}
