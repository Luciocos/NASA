import {
  ChangeDetectionStrategy,
  Component,
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

import { PolygonGeometry } from '../../core/models';
import { OutletPick } from './water-api';
import { WaterAnalysis } from './water.types';

/** qué muestra el mapa al abrir: la cuenca (sección A) o el impacto sobre el lote (sección D) */
export type WaterMapMode = 'basin' | 'impact';

export const WATER_STYLE = {
  lot: '#ffffff',
  contributing: '#ffd166',
  basin: '#4cc9f0',
  subbasin: '#90e0ef',
  stream: '#1d6fd8',
  osm: '#00b4d8',
  entry: '#f4a261',
  exit: '#2a9d8f',
  sector: '#e63946',
} as const;

const fmtHa = (ha: number) => `${ha.toLocaleString('en-US', { maximumFractionDigits: 1 })} ha`;

/**
 * mapa de Cuenca y Caudal: el lote, la cuenca que le aporta agua, la cuenca al punto de salida,
 * subcuencas, cauces del modelo, cursos mapeados en OSM, capas raster del terreno, ingresos y
 * salidas de agua y los sectores a inspeccionar. Cada capa se prende y se apaga desde el control
 * de capas. Un clic en el mapa elige otro punto de salida (outletPick)
 */
@Component({
  selector: 'app-water-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #map class="map" role="region" [attr.aria-label]="label()"></div>`,
  styles: `
    :host {
      position: relative;
      display: block;
      min-height: 22rem;
    }
    .map {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--night-900, #1b2f44);
    }
  `,
})
export class WaterMap {
  readonly geometry = input.required<PolygonGeometry>();
  readonly analysis = input<WaterAnalysis | null>(null);
  readonly mode = input<WaterMapMode>('basin');
  readonly label = input('Map of the field watershed');
  /** el usuario hizo clic para mover el punto de salida */
  readonly outletPick = output<OutletPick>();

  private readonly element = viewChild.required<ElementRef<HTMLElement>>('map');
  private map: L.Map | null = null;
  private control: L.Control.Layers | null = null;
  private overlays: L.Layer[] = [];
  private fitted = false;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterNextRender(() => {
      const map = L.map(this.element().nativeElement, {
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
      });
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' },
      ).addTo(map);
      map.on('click', (e: L.LeafletMouseEvent) =>
        this.outletPick.emit({ lat: e.latlng.lat, lng: e.latlng.lng }),
      );
      this.map = map;
      this.draw();
      this.resizeTimer = setTimeout(() => map.invalidateSize(), 0);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.resizeTimer);
      this.map?.remove();
    });
    effect(() => {
      this.geometry();
      this.analysis();
      untracked(() => this.draw());
    });
  }

  private draw(): void {
    const map = this.map;
    if (!map) return;
    for (const layer of this.overlays) layer.remove();
    this.overlays = [];
    this.control?.remove();

    const ring = this.geometry().coordinates[0].map(([lng, lat]) => L.latLng(lat, lng));
    const lot = L.polygon(ring, {
      color: WATER_STYLE.lot,
      weight: 2.5,
      fill: false,
      interactive: false,
    });
    const a = this.analysis();
    const overlays: Record<string, L.Layer> = {};
    const visible: L.Layer[] = [lot];
    overlays['Field'] = lot;

    if (a) {
      const impact = this.mode() === 'impact';
      const bounds = L.latLngBounds(a.layers.bounds);
      const raster = (url: string, opacity: number) =>
        L.imageOverlay(url, bounds, { opacity, interactive: false });
      const accumulation = raster(a.layers.flow_accumulation, 0.85);
      const twi = raster(a.layers.twi, 0.75);
      const depressions = raster(a.layers.depressions, 0.85);

      const contributing = L.geoJSON(a.contributing.geometry as never, {
        style: { color: WATER_STYLE.contributing, weight: 2, dashArray: '6 4', fillOpacity: 0.08 },
      }).bindTooltip(
        `Basin draining into the field: ${fmtHa(a.contributing.area_ha)} (${fmtHa(a.contributing.outside_lot_ha)} outside the field)`,
        { sticky: true },
      );
      const basin = L.geoJSON(a.basin.geometry as never, {
        style: { color: WATER_STYLE.basin, weight: 2.5, fillOpacity: 0.1 },
      }).bindTooltip(`Basin at the outlet point: ${fmtHa(a.basin.area_ha)}`, { sticky: true });
      const subbasins = L.layerGroup(
        a.subbasins.map((s) =>
          L.geoJSON(s.geometry as never, {
            style: { color: WATER_STYLE.subbasin, weight: 1, dashArray: '2 4', fillOpacity: 0 },
          }).bindTooltip(`Sub-basin ${s.id}: ${fmtHa(s.area_ha)}`, { sticky: true }),
        ),
      );
      const streams = L.geoJSON(a.streams as never, {
        style: { color: WATER_STYLE.stream, weight: 3 },
        onEachFeature: (f, layer) =>
          layer.bindTooltip(
            `Potential channel from the DEM · ${fmtHa(f.properties.upstream_ha ?? 0)} upstream. It may not exist on the ground.`,
            { sticky: true },
          ),
      });
      const osm = L.geoJSON(a.osm_waterways as never, {
        style: { color: WATER_STYLE.osm, weight: 3, dashArray: '8 3' },
        onEachFeature: (f, layer) =>
          layer.bindTooltip(
            `${f.properties.name ?? 'Mapped waterway'} (${f.properties.waterway ?? 'OSM'})${f.properties.culvert ? ' · culvert' : ''} · OpenStreetMap`,
            { sticky: true },
          ),
      });
      const arrows = L.layerGroup(
        a.flow_arrows.map(([lat, lng, toLat, toLng]) =>
          L.polyline(
            [
              [lat, lng],
              [toLat, toLng],
            ],
            { color: '#e0f2ff', weight: 1, opacity: 0.55, interactive: false },
          ),
        ),
      );
      const arrowHeads = L.layerGroup(
        a.flow_arrows.map(([, , toLat, toLng]) =>
          L.circleMarker([toLat, toLng], {
            radius: 1.4,
            color: '#e0f2ff',
            weight: 0,
            fillOpacity: 0.6,
            interactive: false,
          }),
        ),
      );
      const flow = L.layerGroup([arrows, arrowHeads]);
      const points = L.layerGroup([
        ...a.entries.map((p) =>
          L.circleMarker([p.lat, p.lng], {
            radius: 6 + Math.min(8, Math.sqrt(p.upstream_ha)),
            color: '#000',
            weight: 1,
            fillColor: WATER_STYLE.entry,
            fillOpacity: 0.95,
          }).bindTooltip(`Water inflow into the field · ${fmtHa(p.upstream_ha)} upstream`),
        ),
        ...a.exits.map((p) =>
          L.circleMarker([p.lat, p.lng], {
            radius: 6 + Math.min(8, Math.sqrt(p.upstream_ha)),
            color: '#000',
            weight: 1,
            fillColor: WATER_STYLE.exit,
            fillOpacity: 0.95,
          }).bindTooltip(`Water outflow from the field · collects ${fmtHa(p.upstream_ha)}`),
        ),
      ]);
      const sectors = L.layerGroup(
        a.inspection.sectors.map((s, i) =>
          L.geoJSON(s.geometry as never, {
            style: { color: WATER_STYLE.sector, weight: 2, fillOpacity: 0.25 },
          }).bindTooltip(`Sector ${i + 1} to inspect · ${fmtHa(s.area_ha)} · ${s.reason}`, {
            sticky: true,
          }),
        ),
      );
      const outlet = L.circleMarker([a.outlet.lat, a.outlet.lng], {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#0b3d91',
        fillOpacity: 1,
      }).bindTooltip('Outlet point of the analysis. Click the map to move it.');

      Object.assign(overlays, {
        'Basin draining into the field': contributing,
        'Basin at the outlet point': basin,
        'Sub-basins': subbasins,
        'Potential channels (DEM)': streams,
        'Canals and streams (OSM)': osm,
        'Flow direction': flow,
        'Flow accumulation': accumulation,
        'Wetness index (TWI)': twi,
        'Low spots (DEM)': depressions,
        'Water inflows and outflows': points,
        'Sectors to inspect': sectors,
        'Outlet point': outlet,
      });
      visible.push(
        ...(impact
          ? [twi, contributing, flow, osm, points, sectors]
          : [accumulation, contributing, basin, subbasins, streams, osm, outlet]),
      );
    }

    for (const layer of visible) layer.addTo(map);
    this.overlays = Object.values(overlays);
    this.control = L.control.layers(undefined, overlays, { collapsed: true }).addTo(map);

    if (!this.fitted || !a) {
      const target = a
        ? L.geoJSON(a.contributing.geometry as never)
            .getBounds()
            .extend(L.latLngBounds(ring))
        : L.latLngBounds(ring);
      map.fitBounds(target.pad(0.15));
      this.fitted = !!a;
    }
  }
}
