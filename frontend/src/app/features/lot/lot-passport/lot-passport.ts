import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  PendingTasks,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../../core/api';
import { LotDetail } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icons';
import { SectionCard } from '../../../shared/ui/section-card/section-card';

/** lo que pasó al compartir el pasaporte: copiado, para copiar a mano o con error */
type ShareState =
  | { status: 'copied' | 'manual'; url: string; path: string }
  | { status: 'error'; url?: undefined; path?: undefined };

/** lo que muestra el enlace, en tres palabras: lo mismo que la página pública del pasaporte */
const INCLUDES: readonly { icon: IconName; label: string }[] = [
  { icon: 'list', label: 'Seasons' },
  { icon: 'calendar', label: 'Field log' },
  { icon: 'footprint', label: 'Footprint and score' },
];

/**
 * pestaña Pasaporte del lote: una sola acción, Compartir pasaporte, que genera el enlace público
 * de solo lectura y lo copia. en un lote propio cada pedido genera un enlace nuevo (la segunda vez
 * en la misma pestaña se vuelve a copiar el mismo); en un ejemplo el backend devuelve siempre el
 * mismo, sin cuenta
 *
 * el pedido al portapapeles sale en el mismo toque (Safari lo exige) y el texto llega cuando
 * responde el backend. si el navegador no deja copiar, el enlace queda a la vista para copiarlo a
 * mano
 *
 * @example <app-lot-passport [lot]="lot" />
 */
@Component({
  selector: 'app-lot-passport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, SectionCard],
  template: `
    <app-section-card
      heading="Field passport"
      subtitle="A public, read-only link to show the field to anyone you choose."
    >
      <ul class="includes" aria-label="What the link shows">
        @for (item of includes; track item.label) {
          <li class="chip"><app-icon [name]="item.icon" /> {{ item.label }}</li>
        }
      </ul>
      <button
        type="button"
        class="btn btn--primary share-btn"
        [attr.aria-disabled]="sharing() || null"
        (click)="share()"
      >
        <app-icon name="passport" />
        {{ sharing() ? 'Creating the link…' : 'Share passport' }}
      </button>
      <div class="result" aria-live="polite">
        @if (state(); as s) {
          @if (s.status === 'error') {
            <p class="msg msg--error" role="alert">
              <app-icon name="alert" /> Couldn't create the passport. Try again in a little while.
            </p>
          } @else {
            @if (s.status === 'copied') {
              <p class="msg">
                <app-icon name="check" /> Link copied. Paste it in a message to share it.
              </p>
            } @else {
              <p class="msg">Couldn't copy it automatically. Copy the link:</p>
              <input
                class="url"
                type="text"
                readonly
                aria-label="Passport link"
                [value]="s.url"
                (focus)="selectAll($event)"
              />
            }
            <a class="open" [routerLink]="s.path"
              >Open the passport <app-icon name="arrow-right"
            /></a>
          }
        }
      </div>
    </app-section-card>
  `,
  styles: `
    :host {
      display: block;
      max-width: 40rem;
    }
    .includes {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0 0 var(--space-5);
      padding: 0;
      list-style: none;
    }
    .includes .chip {
      --icon-size: 0.95rem;
    }
    .result {
      display: grid;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }
    .result:empty {
      display: none;
    }
    .msg {
      --icon-size: 1rem;
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      margin: 0;
      color: var(--ink-2);
      font-size: var(--text-sm);
      line-height: 1.4;
    }
    .msg app-icon {
      flex: none;
      margin-top: 0.125rem;
      color: var(--ok);
    }
    .msg--error,
    .msg--error app-icon {
      color: var(--danger);
    }
    .url {
      width: 100%;
      min-height: var(--tap);
      padding: 0 var(--space-3);
      border: 1px solid var(--line-control);
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      color: var(--ink);
      font-size: var(--text-sm);
    }
    .open {
      --icon-size: 1rem;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      justify-self: start;
      min-height: var(--tap);
      color: var(--link);
      font-size: var(--text-sm);
      font-weight: 600;
      text-decoration: none;
    }
    .open:hover {
      text-decoration: underline;
    }
    /* en el celular la acción principal ocupa todo el ancho */
    @media (max-width: 40rem) {
      .share-btn {
        width: 100%;
      }
    }
  `,
})
export class LotPassport {
  private readonly api = inject(Api);
  private readonly document = inject(DOCUMENT);
  private readonly pendingTasks = inject(PendingTasks);

  readonly lot = input.required<LotDetail>();

  protected readonly includes = INCLUDES;
  protected readonly sharing = signal(false);
  protected readonly state = signal<ShareState | null>(null);
  private readonly lotId = computed(() => this.lot().id);

  constructor() {
    // otro lote en el mismo lugar: su enlace es otro
    effect(() => {
      this.lotId();
      untracked(() => this.state.set(null));
    });
  }

  protected share(): void {
    const lot = this.lot();
    if (this.sharing()) return;
    // la app no está estable hasta que termina: las pruebas y el render esperan el resultado
    const done = this.pendingTasks.add();
    const known = this.state();
    if (known?.url) {
      const { url, path } = known;
      void this.copy(Promise.resolve(url))
        .then((copied) => this.state.set({ status: copied ? 'copied' : 'manual', url, path }))
        .finally(done);
      return;
    }
    this.sharing.set(true);
    this.state.set(null);
    const link = firstValueFrom(this.api.createPassport(lot.id)).then((passport) => ({
      path: passport.url,
      url: new URL(passport.url, this.document.baseURI).href,
    }));
    const url = link.then((value) => value.url);
    // si el pedido falla, el error se informa una sola vez, abajo
    url.catch(() => undefined);
    const copied = this.copy(url);
    link
      .then(
        async (value) => this.state.set({ status: (await copied) ? 'copied' : 'manual', ...value }),
        () => this.state.set({ status: 'error' }),
      )
      .finally(() => {
        this.sharing.set(false);
        done();
      });
  }

  protected selectAll(event: Event): void {
    (event.target as HTMLInputElement | null)?.select();
  }

  private async copy(text: Promise<string>): Promise<boolean> {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard) return false;
    try {
      if (typeof ClipboardItem === 'undefined' || !clipboard.write) throw new Error('sin write');
      const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
      await clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    } catch {
      try {
        await clipboard.writeText(await text);
        return true;
      } catch {
        return false;
      }
    }
  }
}
