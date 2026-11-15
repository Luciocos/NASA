import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  Service,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';

import { Icon } from '../../../shared/ui/icon/icon';
import { LocationError, Spot, locateOnce } from '../my-location';

/** un lugar encontrado: dónde llevar el mapa */
export interface Place {
  id: string;
  /** "Casilda" */
  name: string;
  /** "Departamento Caseros, Santa Fe" */
  detail: string;
  lat: number;
  lng: number;
  /** [[sur, oeste], [norte, este]], si el servicio la manda */
  bounds: [[number, number], [number, number]] | null;
}

/** el buscador no pudo responder: el mensaje ya está listo para mostrar */
export class PlaceSearchError extends Error {}

/** buscador de lugares de OpenStreetMap: solo Argentina, como mucho 5 resultados */
export const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
// la política de uso de Nominatim pide como mucho un pedido por segundo
const MIN_INTERVAL_MS = 1_100;

interface NominatimRow {
  place_id?: number | string;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
}

/**
 * busca lugares en Nominatim (OpenStreetMap) para llevar el mapa del alta de lote cerca del
 * campo. respeta su política de uso: se consulta solo cuando la persona aprieta Enter o Buscar
 * (nunca por tecla), con un pedido por segundo como mucho y guardando en memoria lo ya buscado.
 * va con fetch directo y sin credenciales: los interceptores de la app no le agregan nada
 */
@Service()
export class PlaceSearch {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly cache = new Map<string, Place[]>();
  private lastAt = 0;

  async search(query: string): Promise<Place[]> {
    const text = query.trim().replace(/\s+/g, ' ');
    const key = text.toLocaleLowerCase('es-AR');
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (this.window?.navigator.onLine === false) {
      throw new PlaceSearchError(
        "We can't search for places offline. Move the map by hand or use your location.",
      );
    }
    const wait = this.lastAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastAt = Date.now();

    const url = `${NOMINATIM_SEARCH}?format=jsonv2&countrycodes=ar&limit=5&q=${encodeURIComponent(text)}`;
    let response: Response;
    try {
      response = await globalThis.fetch(url, { credentials: 'omit' });
    } catch {
      throw new PlaceSearchError(
        "We couldn't reach the place search. Check your connection or move the map by hand.",
      );
    }
    if (response.status === 429) {
      throw new PlaceSearchError('The place search is busy. Try again in a few seconds.');
    }
    if (!response.ok) {
      throw new PlaceSearchError(
        "The place search didn't respond. Try again or move the map by hand.",
      );
    }
    const rows = (await response.json()) as unknown;
    const places = Array.isArray(rows)
      ? rows.map((row) => toPlace(row as NominatimRow)).filter((place) => place !== null)
      : [];
    this.cache.set(key, places);
    return places;
  }
}

function toPlace(row: NominatimRow): Place | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const parts = (row.display_name ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && part !== 'Argentina' && !/^[A-Z]?\d{4}[A-Z]{0,3}$/.test(part));
  const name = row.name?.trim() || parts[0] || 'Unnamed place';
  const detail = parts.filter((part) => part !== name).join(', ');
  const box = (row.boundingbox ?? []).map(Number);
  const bounds: Place['bounds'] =
    box.length === 4 && box.every(Number.isFinite)
      ? [
          [box[0], box[2]],
          [box[1], box[3]],
        ]
      : null;
  return { id: String(row.place_id ?? `${lat},${lng}`), name, detail, lat, lng, bounds };
}

/**
 * buscador de lugares y "Usar mi ubicación", arriba del mapa del alta de lote. busca solo al
 * apretar Enter o Buscar. los resultados flotan debajo, con la atribución de OpenStreetMap, y se
 * cierran al elegir uno o con Escape
 */
@Component({
  selector: 'app-place-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { '(keydown.escape)': 'close()' },
  template: `
    <form class="bar" role="search" aria-label="Search for a place" (submit)="submit($event)">
      <label class="query">
        <span class="visually-hidden">Town, rural area or road</span>
        <app-icon name="search" />
        <input
          type="search"
          name="q"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="Search for your town"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
      </label>
      <button type="submit" class="btn" [disabled]="busy() || query().trim() === ''">
        {{ busy() ? 'Searching…' : 'Search' }}
      </button>
      <button
        type="button"
        class="btn locate"
        [disabled]="locating()"
        [attr.aria-label]="locating() ? 'Finding your location' : 'Use my location'"
        (click)="locate()"
      >
        <app-icon name="locate" />
        <span class="locate__text">{{ locating() ? 'Locating…' : 'Use my location' }}</span>
      </button>
    </form>

    @if (panel(); as view) {
      <div class="results" role="region" aria-label="Search results" animate.enter="enter-rise">
        @switch (view) {
          @case ('error') {
            <p class="message" role="alert">{{ error() }}</p>
          }
          @case ('empty') {
            <p class="message">
              We couldn't find “{{ searched() }}”. Try the nearest town or move the map by hand.
            </p>
          }
          @case ('places') {
            <ul>
              @for (place of places(); track place.id) {
                <li>
                  <button type="button" class="place" (click)="pick(place)">
                    <app-icon name="pin" />
                    <span>
                      <strong>{{ place.name }}</strong>
                      @if (place.detail) {
                        <span class="detail">{{ place.detail }}</span>
                      }
                    </span>
                  </button>
                </li>
              }
            </ul>
          }
        }
        <footer>
          @if (view !== 'error') {
            <span class="attribution">
              Places:
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
                >© OpenStreetMap contributors</a
              >
            </span>
          }
          <button type="button" class="btn btn--ghost btn--sm" (click)="close()">Close</button>
        </footer>
      </div>
    }
    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
  `,
  styles: `
    :host {
      position: relative;
      z-index: calc(var(--z-hud) + 5);
      display: block;
    }
    p {
      margin: 0;
    }
    .bar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: var(--space-2);
    }
    .query {
      position: relative;
      display: block;
    }
    .query app-icon {
      --icon-size: 1.15rem;
      position: absolute;
      top: 50%;
      left: 0.85rem;
      translate: 0 -50%;
      color: var(--ink-3);
      pointer-events: none;
    }
    input {
      width: 100%;
      min-height: var(--tap);
      padding: 0 var(--space-3) 0 2.6rem;
      border: 1px solid var(--line-control);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--ink);
      font: inherit;
      font-size: var(--text-md);
    }
    input::placeholder {
      color: var(--ink-3);
    }
    .results {
      position: absolute;
      top: calc(100% + var(--space-2));
      right: 0;
      left: 0;
      display: grid;
      gap: var(--space-2);
      max-width: 36rem;
      padding: var(--space-2);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-3);
    }
    ul {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .place {
      --icon-size: 1.1rem;
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      width: 100%;
      min-height: var(--tap);
      padding: var(--space-2) var(--space-3);
      border: 0;
      border-radius: var(--radius-md);
      background: none;
      color: var(--ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .place:hover {
      background: var(--paper-2);
    }
    .place app-icon {
      margin-top: 0.15rem;
      color: var(--field-700);
    }
    .place > span {
      display: grid;
      gap: 0.125rem;
      min-width: 0;
    }
    .detail {
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .message {
      padding: var(--space-2) var(--space-3);
      color: var(--ink-2);
      font-size: var(--text-sm);
    }
    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-1) 0 var(--space-3);
      border-top: 1px solid var(--line);
    }
    .attribution {
      color: var(--ink-3);
      font-size: var(--text-xs);
    }
    footer .btn {
      margin-left: auto;
    }
    @media (max-width: 40rem) {
      .bar > [type='submit'] {
        padding-inline: var(--space-3);
      }
      .locate {
        width: var(--tap);
        padding-inline: 0;
      }
      .locate__text {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
  `,
})
export class PlaceSearchBox {
  private readonly search = inject(PlaceSearch);
  private readonly window = inject(DOCUMENT).defaultView;

  /** la persona eligió un lugar de la lista */
  readonly place = output<Place>();
  /** se obtuvo la ubicación del dispositivo */
  readonly located = output<Spot>();

  protected readonly query = signal('');
  protected readonly searched = signal('');
  protected readonly busy = signal(false);
  protected readonly locating = signal(false);
  protected readonly places = signal<readonly Place[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly announcement = signal('');

  protected readonly panel = computed<'error' | 'empty' | 'places' | null>(() => {
    if (this.error()) return 'error';
    const places = this.places();
    if (places === null || this.busy()) return null;
    return places.length === 0 ? 'empty' : 'places';
  });

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const text = this.query().trim();
    if (text === '' || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.places.set(null);
    this.searched.set(text);
    this.announcement.set('Searching…');
    try {
      const places = await this.search.search(text);
      this.places.set(places);
      this.announcement.set(
        places.length === 0
          ? "We couldn't find that place"
          : `${places.length} ${places.length === 1 ? 'place found' : 'places found'}`,
      );
    } catch (err) {
      this.error.set(
        err instanceof PlaceSearchError
          ? err.message
          : "We couldn't search for that place. Try again.",
      );
      this.announcement.set('');
    } finally {
      this.busy.set(false);
    }
  }

  protected pick(place: Place): void {
    this.close();
    this.announcement.set(`Map moved to ${place.name}`);
    this.place.emit(place);
  }

  protected async locate(): Promise<void> {
    if (this.locating()) return;
    this.locating.set(true);
    this.close();
    try {
      const spot = await locateOnce(this.window?.navigator.geolocation);
      this.announcement.set('Map moved to your location');
      this.located.emit(spot);
    } catch (err) {
      this.error.set(err instanceof LocationError ? err.message : "We couldn't get your location.");
    } finally {
      this.locating.set(false);
    }
  }

  protected close(): void {
    this.places.set(null);
    this.error.set(null);
  }
}
