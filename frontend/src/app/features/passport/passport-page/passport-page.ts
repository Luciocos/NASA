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
import { ESTIMATE_NOTICE, formatDateTime, formatNumber, plainError } from '../../footprint/format';
import { ScorePanel } from '../../footprint/score-panel/score-panel';
import { formatEventDate } from '../../lot/labels';

/** en pantalla se ven los primeros eventos de la bitácora; al imprimir van todos */
const EVENTS_ON_SCREEN = 6;

/**
 * Pasaporte del lote (CLAUDE.md, sección 11, pantalla 6): vista pública e imprimible. En pantalla
 * muestra menos texto (los primeros eventos; el desglose, los criterios y las fuentes largas,
 * plegados); al imprimir sale completo, como siempre.
 */
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
  protected readonly eventsOnScreen = EVENTS_ON_SCREEN;
  protected readonly showAllEvents = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly notice = ESTIMATE_NOTICE;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatEventDate = formatEventDate;
  /** rinde con coma decimal: 3,2 t/ha y no 3.2 */
  protected readonly formatNumber = formatNumber;

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
              ? 'This passport has expired and is no longer available.'
              : error.status === 404
                ? 'There is no passport at this link. Check that the link is complete.'
                : plainError(error.status, 'this passport'),
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

    // lo plegado en pantalla (desglose de la huella, criterios del puntaje) sale abierto al
    // imprimir, con el botón o con el menú del navegador, y vuelve a plegarse después
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const opened: HTMLDetailsElement[] = [];
    const beforePrint = () => {
      host.querySelectorAll<HTMLDetailsElement>('details[data-print-open]').forEach((details) => {
        if (details.open) return;
        details.open = true;
        opened.push(details);
      });
    };
    const afterPrint = () => opened.splice(0).forEach((details) => (details.open = false));
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      this.leafletMap?.remove();
    });
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
