import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import { formatHectares } from '../../../core/insights';
import { CampaignDetail, EventLogItem } from '../../../core/models';
import { EventGlyph } from '../../../shared/iso/event-glyph';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionCard } from '../../../shared/ui/section-card/section-card';

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
  /** última campaña, con su cultivo */
  crop: CampaignDetail | null;
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

/** "3 lotes" o "3 lotes y 1 sin sincronizar" */
function describeCounts(lots: readonly ListedLot[]): string | null {
  const own = lots.filter((lot) => !lot.pending).length;
  const pending = lots.length - own;
  const parts = [
    own > 0 ? `${own} ${own === 1 ? 'lote' : 'lotes'}` : '',
    pending > 0 ? `${pending} sin sincronizar` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' y ') : null;
}

/**
 * lista de lotes de Mi campo: una línea por lote (nombre, y hectáreas con su localidad), con el
 * ícono de su último evento. tocar un lote lo abre (Mi campo decide cómo). con más de 6 lotes
 * aparecen la búsqueda (por nombre o localidad) y el orden; en escritorio la lista se desplaza
 * por dentro
 */
@Component({
  selector: 'app-lot-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionCard, EventGlyph, Icon],
  template: `
    <app-section-card heading="Tus lotes" [subtitle]="subtitle()">
      @if (tools()) {
        <div class="tools">
          <label class="field search">
            <span class="visually-hidden">Buscar lote por nombre o localidad</span>
            <app-icon name="search" />
            <input
              type="search"
              placeholder="Buscar lote"
              [value]="query()"
              (input)="onQuery($event)"
            />
          </label>
          <label class="field">
            <span class="visually-hidden">Ordenar lotes por</span>
            <select [value]="sort()" (change)="onSort($event)">
              <option value="name">Nombre</option>
              <option value="area">Más hectáreas</option>
              <option value="recent">Dato más reciente</option>
            </select>
          </label>
        </div>
      }
      @if (loading() && lots().length === 0) {
        <p class="skeleton placeholder" aria-hidden="true"></p>
        <p class="skeleton placeholder" aria-hidden="true"></p>
        <p class="visually-hidden">Cargando lotes…</p>
      } @else if (visible().length === 0) {
        <p class="none">
          {{
            query() ? 'Ningún lote coincide con la búsqueda.' : 'Todavía no hay lotes para mostrar.'
          }}
        </p>
      } @else {
        <ul class="lots" [class.is-long]="tools()">
          @for (lot of visible(); track lot.id; let i = $index) {
            <li animate.enter="enter-rise" [style.--i]="i < 8 ? i : 8">
              <button
                type="button"
                class="lot"
                [class.is-selected]="selectedId() === lot.id"
                [class.is-pending]="lot.pending"
                [attr.aria-pressed]="selectedId() === lot.id"
                [attr.aria-haspopup]="lot.pending ? null : 'dialog'"
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
                      <span class="chip chip--warn">Sin sincronizar</span>
                    } @else if (lot.pending === 'rejected') {
                      <span class="chip chip--danger">Rechazado</span>
                    }
                  </span>
                  @if (lot.pending) {
                    <span class="line">Guardado en este dispositivo</span>
                  } @else {
                    <span class="line">
                      {{ lot.hectares === null ? 'Sin área' : formatHectares(lot.hectares)
                      }}{{ lot.locality ? ' · ' + lot.locality : '' }}
                    </span>
                  }
                </span>
              </button>
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
      grid-template-columns: minmax(0, 1fr) minmax(0, 10rem);
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }
    .search {
      position: relative;
    }
    .search app-icon {
      --icon-size: 1.1rem;
      position: absolute;
      top: 50%;
      left: 0.75rem;
      translate: 0 -50%;
      color: var(--ink-3);
      pointer-events: none;
    }
    .search input {
      padding-left: 2.5rem;
    }
    .lots {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .lot {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      width: 100%;
      padding: var(--space-3);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: translate var(--dur-1) var(--ease-out);
    }
    .lot:hover {
      translate: 0 -1px;
      box-shadow: var(--shadow-2);
    }
    /* el elegido: borde, fondo y una franja a la izquierda, además de aria-pressed */
    .lot.is-selected,
    .lot.is-selected:hover {
      border-color: var(--accent-line);
      background: var(--accent-soft);
      box-shadow: inset 4px 0 0 var(--accent-strong);
    }
    .lot.is-pending {
      border-style: dashed;
    }
    .glyph {
      --glyph-size: 1.2rem;
      display: grid;
      flex: none;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      background: var(--field-50);
      color: var(--field-800);
    }
    .body {
      display: grid;
      flex: 1;
      gap: 0.25rem;
      min-width: 0;
    }
    .top {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .top .chip {
      margin-left: auto;
    }
    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.4rem;
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .none {
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .placeholder {
      height: 4.5rem;
      margin-bottom: var(--space-2);
      border-radius: var(--radius-md);
    }
    @media (min-width: 64.01rem) {
      .lots.is-long {
        max-height: min(36rem, 64vh);
        margin: -4px;
        padding: 4px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .lot:hover {
        translate: none;
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
  /** tocar un lote lo elige (y Mi campo lo abre) */
  readonly lotSelect = output<string>();

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
    return shown < total ? `Mostrando ${shown} de ${total}` : describeCounts(this.lots());
  });

  protected readonly formatHectares = formatHectares;

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as LotSort);
  }
}
