import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, map } from 'rxjs';

import { Api } from '../../../core/api';
import { LotOverview, buildIsoScene, loadOverviews } from '../../../core/lot-scene';
import { LotSummary as Lot } from '../../../core/models';
import { LotOutbox } from '../../../core/offline/lot-outbox';
import { LotSatellite } from '../../../core/nasa';
import { NDVI_LEGEND_GRADIENT, ndviTint } from '../../../shared/iso/ndvi-tint';
import { IsoScene } from '../../../shared/iso/iso-scene';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icons';
import { InfoTip } from '../../../shared/ui/info-tip/info-tip';
import { LotTabKey, lotTabs } from '../../../shared/ui/lot-tabs/lot-tabs';
import { MoreMenu } from '../../../shared/ui/more-menu/more-menu';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { LotDialog } from '../../lot/lot-workspace/lot-dialog';
import { LOT_PARAM, LotLink, openLot } from '../../lot/lot-workspace/lot-link';
import { LocationError, locateOnce, roundCoord } from '../my-location';
import { SatelliteLot, SatelliteView, satelliteLotOf } from '../satellite-view/satellite-view';
import { ListedLot, LotList } from './lot-list';
import { MaquetaLegend } from './maqueta-legend';

type ViewMode = 'maqueta' | 'satelital';

/** acceso directo de la barra de la maqueta a una pestaña del popup del lote elegido */
export interface LotShortcut {
  tab: LotTabKey;
  /** rótulo corto, el mismo de la pestaña ("Datos" abre Satélite) */
  label: string;
  icon: IconName;
  /** comienzo del nombre accesible: "Abrir la huella" + " de lote 2" */
  action: string;
}

const TAB_ICONS = new Map(lotTabs(0).map((tab) => [tab.key, tab.icon]));

function shortcut(tab: LotTabKey, label: string, action: string): LotShortcut {
  return { tab, label, icon: TAB_ICONS.get(tab) ?? 'chart', action };
}

/** los más usados, a la vista en la barra de la maqueta */
export const HUD_SHORTCUTS: readonly LotShortcut[] = [
  shortcut('satellite', 'Datos', 'Abrir los datos'),
  shortcut('footprint', 'Huella', 'Abrir la huella'),
  shortcut('fertilization', 'Fertilización', 'Abrir la fertilización'),
  shortcut('profit', 'Rentabilidad', 'Abrir la rentabilidad'),
];
/** el resto, en "Más" */
export const MORE_SHORTCUTS: readonly LotShortcut[] = [
  shortcut('log', 'Bitácora', 'Abrir la bitácora'),
  shortcut('practices', 'Prácticas', 'Abrir las prácticas'),
];

/**
 * "Mi campo" (CLAUDE.md, sección 11, pantalla 1): solo los lotes del productor (la API devuelve
 * los de su cuenta). sin lotes, una bienvenida que ofrece usar la ubicación para encontrar el
 * campo más rápido o buscarlo en el mapa. con lotes, sin encabezado de página: la maqueta es la
 * protagonista y al costado (abajo en el celular) va solo la lista compacta de "Tus lotes"
 *
 * tocar un lote en la lista o en la maqueta lo marca en las dos y suma a la barra de la maqueta
 * accesos directos a las pestañas de su popup. la lupa de la lista, un acceso directo o abrir el
 * lote en la maqueta lo muestran en el popup, encima de Mi campo (/mapa?lote=12&seccion=huella;
 * atrás lo cierra)
 */
@Component({
  selector: 'app-map-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IsoScene,
    SatelliteView,
    OriginBadge,
    Icon,
    PageHeader,
    InfoTip,
    MoreMenu,
    LotList,
    LotDialog,
    LotLink,
    MaquetaLegend,
  ],
  templateUrl: './map-page.html',
  styleUrl: './map-page.css',
})
export class MapPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly window = inject(DOCUMENT).defaultView;
  protected readonly outbox = inject(LotOutbox);
  private readonly satellite = inject(LotSatellite);
  private readonly scene = viewChild(IsoScene);

  protected readonly view = signal<ViewMode>('maqueta');
  protected readonly showGrid = signal(true);
  /** capa de la maqueta: textura del último evento o NDVI actual de MODIS */
  protected readonly layer = signal<'estado' | 'ndvi'>('estado');
  protected readonly ndviGradient = NDVI_LEGEND_GRADIENT;
  protected readonly shortcuts = HUD_SHORTCUTS;
  protected readonly moreShortcuts = MORE_SHORTCUTS;
  protected readonly selectedId = signal<string | null>(null);

  protected readonly lots = signal<Lot[] | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly overviewMap = signal<ReadonlyMap<number, LotOverview>>(new Map());

  // --- bienvenida sin lotes
  protected readonly locating = signal(false);
  protected readonly locationError = signal<string | null>(null);

  private readonly overviews = computed(() =>
    (this.lots() ?? []).map(
      (lot) => this.overviewMap().get(lot.id) ?? { lot, campaigns: null, last: null, events: [] },
    ),
  );
  /** lotes de la lista: los de la cuenta y los guardados en el dispositivo sin subir */
  protected readonly listed = computed<ListedLot[]>(() => [
    ...this.overviews().map((item) => ({
      id: String(item.lot.id),
      name: item.lot.name,
      hectares: item.lot.area_ha,
      locality: item.lot.locality,
      pending: null,
      error: null,
      last: item.last,
    })),
    ...this.outbox.pending().map((item): ListedLot => ({
      id: `pendiente:${item.localId}`,
      name: item.body.name,
      hectares: null,
      locality: item.body.locality ?? '',
      pending: item.rejected ? 'rejected' : 'waiting',
      error: item.rejected ? (item.error ?? null) : null,
      last: null,
    })),
  ]);
  /** la lista llegó y no hay ningún lote: se muestra la bienvenida */
  protected readonly empty = computed(() => this.lots() !== null && this.listed().length === 0);

  /** NDVI actual de cada lote, solo mientras la capa está activa */
  protected readonly ndvi = computed(() => {
    if (this.layer() !== 'ndvi') return null;
    const refs = (this.lots() ?? []).map((lot) => ({ id: lot.id, geometry: lot.geometry }));
    return refs.length > 0 ? this.satellite.latestNdviForLots(refs)() : null;
  });
  /** algún lote ya tiene su NDVI: recién ahí la escala lleva el origen (VERIFICADO) */
  protected readonly hasNdvi = computed(() =>
    Object.values(this.ndvi()?.data ?? {}).some((obs) => obs?.mean != null),
  );
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
  protected readonly satelliteLots = computed<SatelliteLot[]>(() => [
    ...(this.lots() ?? []).map(satelliteLotOf),
    ...this.outbox.pending().map((item) => ({
      id: `pendiente:${item.localId}`,
      name: item.body.name,
      geometry: item.body.geometry,
      pending: true,
    })),
  ]);
  /** el lote elegido, si ya tiene ficha: uno sin sincronizar no tiene popup ni accesos */
  protected readonly selectedLot = computed(() => {
    const id = this.selectedId();
    const lot = (this.lots() ?? []).find((item) => String(item.id) === id);
    return lot ? { id: lot.id, name: lot.name } : null;
  });

  /** el lote abierto en el popup (?lote=12), también si llegó por un enlace pegado */
  private readonly openedId = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get(LOT_PARAM))),
    { initialValue: null },
  );

  constructor() {
    this.reload();

    // el lote del popup queda marcado detrás: al cerrarlo sigue elegido en la maqueta y la lista
    effect(() => {
      const id = this.openedId();
      if (id && (this.lots() ?? []).some((lot) => String(lot.id) === id)) {
        untracked(() => this.select(id));
      }
    });

    // trae ficha y bitácora de los lotes, una sola vez por lote
    let loading: Subscription | null = null;
    effect((onCleanup) => {
      const missing = (this.lots() ?? []).filter((lot) => !untracked(this.overviewMap).has(lot.id));
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
        this.error.set('No se pudieron cargar tus lotes. Revisá la conexión y probá de nuevo.'),
    });
  }

  /** "Usar mi ubicación": lleva al alta de lote con el mapa ya sobre el campo */
  protected async useLocation(): Promise<void> {
    if (this.locating()) return;
    this.locating.set(true);
    this.locationError.set(null);
    try {
      const spot = await locateOnce(this.window?.navigator.geolocation);
      await this.router.navigate(['/mapa/nuevo'], {
        queryParams: { lat: roundCoord(spot.lat), lng: roundCoord(spot.lng) },
      });
    } catch (err) {
      this.locationError.set(
        err instanceof LocationError ? err.message : 'No pudimos saber dónde estás.',
      );
    } finally {
      this.locating.set(false);
    }
  }

  protected retryNdvi(): void {
    this.satellite.retry();
  }

  /** marca el lote en la maqueta y en la lista (null: ninguno) */
  protected select(id: string | null): void {
    this.selectedId.set(id);
    if (id && this.view() === 'maqueta') this.scene()?.focusLot(id);
  }

  /** tocar un lote de la lista lo marca; tocarlo de nuevo lo desmarca */
  protected toggle(id: string): void {
    this.select(this.selectedId() === id ? null : id);
  }

  /** abre el lote en el popup; uno guardado solo en el dispositivo todavía no tiene ficha */
  protected open(id: string): void {
    if (id.startsWith('pendiente:')) return;
    this.selectedId.set(id);
    openLot(this.router, Number(id));
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
}
