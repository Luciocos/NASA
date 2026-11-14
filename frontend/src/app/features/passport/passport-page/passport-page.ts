import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import * as L from 'leaflet';
import { map } from 'rxjs';

import { Api } from '../../../core/api';
import { PublicPassport } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { FootprintBreakdown } from '../../footprint/footprint-breakdown/footprint-breakdown';
import { ESTIMATE_NOTICE, formatDateTime } from '../../footprint/format';
import { ScorePanel } from '../../footprint/score-panel/score-panel';
import { formatEventDate } from '../../lot/labels';

/** Pasaporte del lote (CLAUDE.md, sección 11, pantalla 6): vista pública e imprimible. */
@Component({
  imports: [OriginBadge, SimulatedNotice, FootprintBreakdown, ScorePanel],
  selector: 'app-passport-page',
  styleUrl: './passport-page.css',
  templateUrl: './passport-page.html',
})
export class PassportPage {
  private readonly api = inject(Api);
  private readonly mapElement = viewChild<ElementRef<HTMLElement>>('map');
  private leafletMap: L.Map | null = null;

  protected readonly token = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('token') ?? '')),
    { initialValue: '' },
  );
  protected readonly passport = signal<PublicPassport | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly notice = ESTIMATE_NOTICE;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatEventDate = formatEventDate;

  constructor() {
    effect((onCleanup) => {
      const token = this.token();
      if (!token) {
        return;
      }
      this.error.set(null);
      const subscription = this.api.passport(token).subscribe({
        next: (passport) => this.passport.set(passport),
        error: (error: { status?: number }) =>
          this.error.set(
            error.status === 410
              ? 'Este pasaporte venció y ya no está disponible.'
              : error.status === 404
                ? 'No existe un pasaporte con este enlace. Revisá que esté completo.'
                : 'No se pudo cargar el pasaporte.',
          ),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    effect(() => {
      const element = this.mapElement()?.nativeElement;
      const passport = this.passport();
      if (element && passport && !this.leafletMap) {
        this.leafletMap = this.drawMap(element, passport);
      }
    });

    inject(DestroyRef).onDestroy(() => this.leafletMap?.remove());
  }

  protected print(): void {
    window.print();
  }

  private drawMap(element: HTMLElement, passport: PublicPassport): L.Map {
    const leafletMap = L.map(element, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(leafletMap);
    const polygon = L.geoJSON(passport.lot.geometry, {
      style: { color: '#1a4f8b', weight: 3, fillOpacity: 0.2 },
    }).addTo(leafletMap);
    const bounds = polygon.getBounds();
    if (bounds.isValid()) {
      leafletMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
    } else {
      leafletMap.setView([-33.05, -61.2], 9);
    }
    return leafletMap;
  }
}
