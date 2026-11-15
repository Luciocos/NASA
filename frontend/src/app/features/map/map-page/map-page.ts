import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { DemoAccount } from '../../../core/account/demo-account';
import { isExampleLot } from '../../../core/account/examples';
import { Api } from '../../../core/api';
import { formatHectares, latestCampaign } from '../../../core/insights';
import { LotOverview, buildIsoScene, loadOverviews } from '../../../core/lot-scene';
import { LotSummary } from '../../../core/models';
import { LotOutbox } from '../../../core/offline/lot-outbox';
import { LotSatellite } from '../../../core/nasa';
import { NDVI_LEGEND_GRADIENT, ndviTint } from '../../../shared/iso/ndvi-tint';
import { EventGlyph } from '../../../shared/iso/event-glyph';
import { IsoScene } from '../../../shared/iso/iso-scene';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Icon } from '../../../shared/ui/icon/icon';
import { formatDate } from '../../lot/labels';
import { SatelliteLot, SatelliteView, satelliteLotOf } from '../satellite-view/satellite-view';

type ViewMode = 'maqueta' | 'satelital';

/**
 * "Mi campo" (CLAUDE.md, sección 11, pantalla 1): los lotes de la cuenta demo y los de ejemplo
 * de la zona en una maqueta isométrica interactiva, con la vista satelital como alternativa
 */
@Component({
  selector: 'app-map-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IsoScene, SatelliteView, EventGlyph, OriginBadge, SimulatedNotice, Icon],
  templateUrl: './map-page.html',
  styleUrl: './map-page.css',
})
export class MapPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly account = inject(DemoAccount);
  protected readonly outbox = inject(LotOutbox);
  private readonly scene = viewChild(IsoScene);

  protected readonly view = signal<ViewMode>('maqueta');
  protected readonly showGrid = signal(true);
  /** capa de la maqueta: textura del último evento o NDVI actual de MODIS */
  protected readonly layer = signal<'estado' | 'ndvi'>('estado');
  protected readonly ndviGradient = NDVI_LEGEND_GRADIENT;
  private readonly satellite = inject(LotSatellite);
  protected readonly selectedId = signal<string | null>(null);

  protected readonly lots = signal<LotSummary[] | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly overviewMap = signal<ReadonlyMap<number, LotOverview>>(new Map());

  /** lotes que se muestran: los de la cuenta y los de ejemplo de la zona */
  private readonly shown = computed(() =>
    (this.lots() ?? []).filter((lot) => this.account.owns(lot.id) || isExampleLot(lot)),
  );
  private readonly overviews = computed(() =>
    this.shown().map(
      (lot) => this.overviewMap().get(lot.id) ?? { lot, campaigns: null, last: null, events: [] },
    ),
  );
  protected readonly mine = computed(() =>
    this.overviews().filter((item) => this.account.owns(item.lot.id)),
  );
  protected readonly examples = computed(() =>
    this.overviews().filter((item) => !this.account.owns(item.lot.id)),
  );
  /** NDVI actual de cada lote, solo mientras la capa está activa */
  protected readonly ndvi = computed(() => {
    if (this.layer() !== 'ndvi') return null;
    const refs = this.shown().map((lot) => ({ id: lot.id, geometry: lot.geometry }));
    return refs.length > 0 ? this.satellite.latestNdviForLots(refs)() : null;
  });
  protected readonly isoLots = computed(() => {
    const lots = buildIsoScene(this.overviews(), this.outbox.pending()).lots;
    const ndvi = this.ndvi();
    if (!ndvi) return lots;
    return lots.map((lot) => {
      const obs = ndvi.data?.[lot.id] ?? null;
      const value = obs?.mean ?? null;
      return {
        ...lot,
        tint: value === null ? null : ndviTint(value),
        // rayado solo si llegó el compuesto y no tiene píxeles válidos: un lote que todavía
        // carga o cuyo pedido falló no se muestra como nublado
        hatched: obs !== null && value === null,
        sublabel: value === null ? lot.sublabel : `NDVI ${value.toLocaleString('es-AR')}`,
      };
    });
  });
  protected readonly selectedNdvi = computed(() => {
    const id = this.selectedId();
    return id ? (this.ndvi()?.data?.[id] ?? null) : null;
  });
  protected readonly satelliteLots = computed<SatelliteLot[]>(() => [
    ...this.overviews().map((item) => satelliteLotOf(item.lot)),
    ...this.outbox.pending().map((item) => ({
      id: `pendiente:${item.localId}`,
      name: item.body.name,
      geometry: item.body.geometry,
      pending: true,
    })),
  ]);
  protected readonly totalHa = computed(() =>
    this.mine().reduce((sum, item) => sum + item.lot.area_ha, 0),
  );
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return this.overviews().find((item) => String(item.lot.id) === id) ?? null;
  });
  protected readonly selectedPending = computed(() => {
    const id = this.selectedId();
    return id?.startsWith('pendiente:')
      ? (this.outbox.pending().find((item) => `pendiente:${item.localId}` === id) ?? null)
      : null;
  });

  protected readonly formatHectares = formatHectares;
  protected readonly formatDate = formatDate;
  protected readonly latestCampaign = latestCampaign;

  constructor() {
    this.reload();

    // trae ficha y bitácora de los lotes que se muestran, una sola vez por lote
    let loading: Subscription | null = null;
    effect((onCleanup) => {
      const missing = this.shown().filter((lot) => !untracked(this.overviewMap).has(lot.id));
      if (missing.length === 0) return;
      loading = loadOverviews(this.api, missing).subscribe((items) =>
        this.overviewMap.update((current) => {
          const next = new Map(current);
          for (const item of items) next.set(item.lot.id, item);
          return next;
        }),
      );
      onCleanup(() => loading?.unsubscribe());
    });

    // lo que la cola subió aparece como lote propio: se vuelve a pedir la lista. lo subido
    // antes de abrir la pantalla ya viene en el primer pedido
    let seen = this.outbox.lastSynced();
    effect(() => {
      const synced = this.outbox.lastSynced();
      if (synced === seen) return;
      seen = synced;
      if (synced.length > 0) untracked(() => this.reload());
    });
  }

  protected reload(): void {
    this.api.lots().subscribe({
      next: (lots) => {
        this.lots.set(lots);
        this.error.set(null);
      },
      error: () =>
        this.error.set('No se pudieron cargar los lotes. Revisá la conexión y probá de nuevo.'),
    });
  }

  protected retryNdvi(): void {
    this.satellite.retry();
  }

  protected select(id: string | null): void {
    this.selectedId.set(id);
    if (id && this.view() === 'maqueta') this.scene()?.focusLot(id);
  }

  protected open(id: string): void {
    if (id.startsWith('pendiente:')) return;
    void this.router.navigate(['/lotes', Number(id)]);
  }

  protected zoom(factor: number): void {
    this.scene()?.zoomBy(factor);
  }

  protected rotate(): void {
    this.scene()?.rotate(1);
  }

  protected fit(): void {
    this.scene()?.fitAll(true);
  }

  protected eventCount(item: LotOverview): string {
    const count = item.lot.event_count;
    return `${count} ${count === 1 ? 'evento' : 'eventos'}`;
  }
}
