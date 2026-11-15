import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  booleanAttribute,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { formatHectares } from '../../../core/insights';
import { EventLogItem } from '../../../core/models';
import { EventGlyph } from '../../../shared/iso/event-glyph';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { EVENT_TYPE_LABELS, formatDate } from '../../lot/labels';
import { LotLink } from '../../lot/lot-workspace/lot-link';

/** un lote en la lista de Mi campo: de la cuenta o guardado solo en el dispositivo */
export interface ListedLot {
  /** id del backend como texto, o "pendiente:<id local>" */
  id: string;
  name: string;
  /** null en un lote sin sincronizar: el área la calcula el backend */
  hectares: number | null;
  locality: string;
  /** guardado solo en el dispositivo: esperando subirse o rechazado por el servidor */
  pending: 'waiting' | 'rejected' | null;
  /** por qué lo rechazó el servidor */
  error: string | null;
  last: EventLogItem | null;
}

export type LotSort = 'name' | 'area' | 'recent';

/** desde cuántos lotes aparecen la búsqueda y el orden: con pocos, sobran */
export const LOT_TOOLS_FROM = 7;

const COLLATOR = new Intl.Collator('es-AR', { numeric: true, sensitivity: 'base' });

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function sortLots(sort: LotSort): (a: ListedLot, b: ListedLot) => number {
  return (a, b) => {
    // los que esperan subirse van al final
    const group = Number(a.pending !== null) - Number(b.pending !== null);
    if (group !== 0) return group;
    const diff =
      sort === 'area'
        ? (b.hectares ?? -1) - (a.hectares ?? -1)
        : sort === 'recent'
          ? (b.last?.date ?? '').localeCompare(a.last?.date ?? '')
          : 0;
    return diff !== 0 ? diff : COLLATOR.compare(a.name, b.name);
  };
}

/** "3 lotes · 178,2 ha" o "3 lotes · 178,2 ha · 1 sin sincronizar" */
function describeCounts(lots: readonly ListedLot[]): string | null {
  const own = lots.filter((lot) => !lot.pending);
  const pending = lots.length - own.length;
  const hectares = own.reduce((sum, lot) => sum + (lot.hectares ?? 0), 0);
  const parts = [
    own.length > 0 ? `${own.length} ${own.length === 1 ? 'field' : 'fields'}` : '',
    own.length > 0 ? formatHectares(hectares) : '',
    pending > 0 ? `${pending} not synced` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * "Tus lotes" en Mi campo: cada lote es una tarjeta compacta con su nombre, sus hectáreas y una
 * línea de estado (el último evento con su origen, o "Sin eventos todavía"). tocar la tarjeta
 * marca el lote (en la lista y en la maqueta); la lupa lo abre en el popup. con más de 6 lotes
 * aparecen la búsqueda (por nombre o localidad) y el orden, y la lista se desplaza por dentro
 */
@Component({
  selector: 'app-lot-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionCard, EventGlyph, OriginBadge, SimulatedNotice, Icon, LotLink],
  template: `
    <app-section-card heading="Your fields" [subtitle]="subtitle()">
      @if (tools()) {
        <div class="tools">
          <label class="field search">
            <span class="visually-hidden">Search fields by name or town</span>
            <app-icon name="search" />
            <input type="search" placeholder="Search" [value]="query()" (input)="onQuery($event)" />
          </label>
          <label class="field sort">
            <span class="visually-hidden">Sort fields</span>
            <app-icon name="sort" />
            <select [value]="sort()" (change)="onSort($event)">
              <option value="name">Name</option>
              <option value="area">Hectares</option>
              <option value="recent">Latest data</option>
            </select>
          </label>
        </div>
      }
      @if (loading() && lots().length === 0) {
        <p class="skeleton placeholder" aria-hidden="true"></p>
        <p class="skeleton placeholder" aria-hidden="true"></p>
        <p class="visually-hidden">Loading fields…</p>
      } @else if (visible().length === 0) {
        <p class="none">
          {{ query() ? 'No fields match your search.' : 'No fields to show yet.' }}
        </p>
      } @else {
        <ul #list class="lots" [class.is-long]="tools()">
          @for (lot of visible(); track lot.id; let i = $index) {
            <li
              class="lot"
              [class.is-selected]="selectedId() === lot.id"
              [class.is-pending]="lot.pending"
              [attr.data-lot]="lot.id"
              animate.enter="enter-rise"
              [style.--i]="i < 8 ? i : 8"
            >
              <button
                type="button"
                class="lot__pick"
                [attr.aria-pressed]="selectedId() === lot.id"
                (click)="lotSelect.emit(lot.id)"
              >
                <span class="glyph">
                  <app-event-glyph
                    [type]="lot.pending ? 'PENDING' : (lot.last?.type ?? 'NO_DATA')"
                  />
                </span>
                <span class="body">
                  <span class="top">
                    <strong class="name">{{ lot.name }}</strong>
                    @if (lot.pending === 'waiting') {
                      <span class="chip chip--warn">Not synced</span>
                    } @else if (lot.pending === 'rejected') {
                      <span class="chip chip--danger">Rejected</span>
                    }
                  </span>
                  @if (lot.pending === 'rejected') {
                    <span class="line reason">{{ lot.error || 'The server rejected it' }}</span>
                  } @else if (lot.pending) {
                    <span class="line">Uploads when you're back online</span>
                  } @else {
                    <span class="line">
                      {{ hectaresOf(lot) }} ·
                      @if (lot.last; as event) {
                        {{ eventLabel(event) }} {{ formatDate(event.date) }}
                        <app-origin-badge [origin]="event.origin" />
                      } @else {
                        No events yet
                      }
                    </span>
                  }
                  @if (lot.last?.is_simulated) {
                    <app-simulated-notice class="simulated" />
                  }
                </span>
              </button>
              @if (!lot.pending) {
                <a
                  class="btn btn--ghost btn--icon lot__open"
                  [appLotLink]="numberOf(lot)"
                  [attr.aria-label]="'View ' + lot.name"
                >
                  <app-icon name="search" />
                </a>
              }
            </li>
          }
        </ul>
      }
    </app-section-card>
  `,
  styles: `
    :host {
      display: block;
    }
    p {
      margin: 0;
    }
    .tools {
      display: grid;
      /* el orden mide lo que su opción más larga; la búsqueda se queda con el resto */
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }
    /* la lupa y el ícono de orden dicen qué hace cada control sin un rótulo a la vista */
    .search,
    .sort {
      position: relative;
    }
    .search app-icon,
    .sort app-icon {
      --icon-size: 1.1rem;
      position: absolute;
      top: 50%;
      left: 0.75rem;
      translate: 0 -50%;
      color: var(--ink-3);
      pointer-events: none;
    }
    .search input,
    .sort select {
      padding-left: 2.5rem;
    }
    .lots {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* tarjeta compacta: lo que se toca para marcar el lote y, a la derecha, la lupa */
    .lot {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      padding-right: var(--space-1);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
      transition: box-shadow var(--dur-1) var(--ease-out);
    }
    .lot:hover {
      box-shadow: var(--shadow-2);
    }
    /* el elegido: borde, fondo y una franja a la izquierda, además de aria-pressed */
    .lot.is-selected {
      border-color: var(--accent-line);
      background: var(--accent-soft);
      box-shadow: inset 4px 0 0 var(--accent-strong);
    }
    .lot.is-pending {
      border-style: dashed;
    }
    .lot__pick {
      display: flex;
      flex: 1;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
      min-height: var(--tap);
      padding: var(--space-2) var(--space-1) var(--space-2) var(--space-3);
      border: 0;
      border-radius: var(--radius-md);
      background: none;
      color: var(--ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .lot__open {
      --icon-size: 1.25rem;
      flex: none;
    }
    .glyph {
      --glyph-size: 1.1rem;
      display: grid;
      flex: none;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: var(--field-50);
      color: var(--field-800);
    }
    .body {
      display: grid;
      flex: 1;
      gap: 0.125rem;
      min-width: 0;
    }
    .top {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }
    .name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .top .chip {
      flex: none;
      margin-left: auto;
    }
    .line {
      color: var(--ink-3);
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
    }
    .line app-origin-badge {
      margin-left: 0.25rem;
      vertical-align: 0.0625rem;
    }
    .reason {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
    .simulated {
      font-size: var(--text-xs);
    }
    .none {
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .placeholder {
      height: 3.5rem;
      margin-bottom: var(--space-2);
      border-radius: var(--radius-md);
    }
    /* en la compu la lista no pasa el alto de la maqueta: se desplaza por dentro */
    @media (min-width: 64.01rem) {
      .lots {
        max-height: calc(var(--stage-h, 36rem) - 2.5rem);
        margin: -4px;
        padding: 4px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .lots.is-long {
        max-height: calc(var(--stage-h, 36rem) - 6rem);
      }
    }
    /* en el celular, con muchos lotes, también: la página no se alarga sin fin */
    @media (max-width: 64rem) {
      .lots.is-long {
        max-height: min(28rem, 60svh);
        margin: -4px;
        padding: 4px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
    }
  `,
})
export class LotList {
  /** en el orden que llegan; la lista los ordena (los sin sincronizar al final) */
  readonly lots = input.required<readonly ListedLot[]>();
  readonly selectedId = input<string | null>(null);
  /** la lista del backend todavía no llegó */
  readonly loading = input(false, { transform: booleanAttribute });
  /**
   * tocar la tarjeta de un lote (Mi campo lo marca o lo desmarca). la lupa abre el popup por la
   * dirección (?lote=), y Mi campo marca detrás el lote abierto
   */
  readonly lotSelect = output<string>();

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly query = signal('');
  protected readonly sort = signal<LotSort>('name');
  protected readonly tools = computed(() => this.lots().length >= LOT_TOOLS_FROM);

  protected readonly visible = computed(() => {
    const tools = this.tools();
    const query = tools ? normalize(this.query().trim()) : '';
    return this.lots()
      .filter((lot) => !query || normalize(`${lot.name} ${lot.locality}`).includes(query))
      .sort(sortLots(tools ? this.sort() : 'name'));
  });

  protected readonly subtitle = computed(() => {
    const total = this.lots().length;
    const shown = this.visible().length;
    return shown < total ? `Showing ${shown} of ${total}` : describeCounts(this.lots());
  });

  protected readonly formatDate = formatDate;

  constructor() {
    // un lote marcado en la maqueta queda a la vista en la lista, sin mover la página
    afterRenderEffect(() => {
      const id = this.selectedId();
      const list = this.list()?.nativeElement;
      if (!id || !list || list.scrollHeight <= list.clientHeight) return;
      const item = [...list.children].find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.dataset['lot'] === id,
      );
      if (!item) return;
      const box = list.getBoundingClientRect();
      const row = item.getBoundingClientRect();
      if (row.top < box.top) list.scrollTop -= box.top - row.top + 4;
      else if (row.bottom > box.bottom) list.scrollTop += row.bottom - box.bottom + 4;
    });
  }

  /** id del backend: solo los lotes ya sincronizados tienen lupa */
  protected numberOf(lot: ListedLot): number {
    return Number(lot.id);
  }

  protected hectaresOf(lot: ListedLot): string {
    return lot.hectares === null ? 'No area' : formatHectares(lot.hectares);
  }

  /** rótulo del tipo de evento por su clave; si no hay, el que mandó el backend */
  protected eventLabel(event: EventLogItem): string {
    return EVENT_TYPE_LABELS[event.type] ?? event.type_label;
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as LotSort);
  }
}
