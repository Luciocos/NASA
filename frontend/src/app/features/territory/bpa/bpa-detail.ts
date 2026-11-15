import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';

import { LotDetail } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { TerritoryApi } from '../territory-api';
import { TerritorialCheck } from '../territory.types';
import { BpaChoice, BpaDeclarationRequest, BpaDetails } from './bpa.types';

let nextId = 0;

const CHOICES: { value: BpaChoice; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unset', label: 'Not declared' },
];

/**
 * Detalle propio del chequeo 'bpa' dentro del panel de chequeos territoriales. Muestra lo que
 * el productor declaró sobre su adhesión a Buenas Prácticas Agrícolas provinciales y, si es el
 * dueño, le deja declararlo. Es un dato declarado: no se verifica contra ningún registro.
 */
@Component({
  imports: [Icon],
  selector: 'app-bpa-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './bpa-detail.css',
  template: `
    @if (details().adheres !== undefined) {
      <dl class="declared">
        <div>
          <dt>Enrollment</dt>
          <dd>
            {{ details().adheres ? 'Declared as enrolled' : 'Declared as not enrolled' }}
            <span class="badge">Declared</span>
          </dd>
        </div>
        @if (details().registration_number) {
          <div>
            <dt>Registration no.</dt>
            <dd>{{ details().registration_number }}</dd>
          </div>
        }
        @if (declaredAt(); as date) {
          <div>
            <dt>Declaration date</dt>
            <dd>{{ date }}</dd>
          </div>
        }
      </dl>
      <p class="note">Not checked against the provincial registry.</p>
    }

    @if (editable()) {
      <form class="form" novalidate (submit)="$event.preventDefault(); save()">
        <fieldset class="fieldset">
          <legend class="legend-text">
            Are you enrolled in the provincial Good practices program?
          </legend>
          <div class="seg">
            @for (c of choices; track c.value) {
              <label>
                <input
                  type="radio"
                  [name]="uid + '-adheres'"
                  [value]="c.value"
                  [checked]="choice() === c.value"
                  (change)="choice.set(c.value)"
                />
                {{ c.label }}
              </label>
            }
          </div>
        </fieldset>

        @if (choice() === 'yes') {
          <div class="field">
            <label [for]="uid + '-number'">Registration no. (optional)</label>
            <input
              [id]="uid + '-number'"
              autocomplete="off"
              maxlength="64"
              [value]="number()"
              (input)="number.set($any($event.target).value)"
            />
          </div>
        }

        @if (error(); as message) {
          <p class="alert alert--error" role="alert">
            <app-icon name="alert" /><span>{{ message }}</span>
          </p>
        }

        <div class="foot">
          <button type="submit" class="btn btn--primary btn--sm" [disabled]="saving()">
            <app-icon name="save" /> {{ saving() ? 'Saving…' : 'Save declaration' }}
          </button>
          @if (saved()) {
            <p class="saved" role="status">
              <app-icon name="check" /><span>Declaration saved.</span>
            </p>
          }
        </div>
      </form>
    }
  `,
})
export class BpaDetail {
  private readonly api = inject(TerritoryApi);

  readonly check = input.required<TerritorialCheck>();
  readonly lot = input.required<LotDetail>();
  /** true si el usuario es dueño del lote y puede declarar. */
  readonly editable = input(false);
  /** Avisa al panel que vuelva a pedir los chequeos (por ejemplo, después de declarar). */
  readonly changed = output<void>();

  protected readonly uid = `bpa-${nextId++}`;
  protected readonly choices = CHOICES;

  protected readonly details = computed(() => this.check().details as BpaDetails);
  protected readonly declaredAt = computed(() => {
    const raw = this.details().declared_at;
    return raw ? new Date(raw).toLocaleDateString('en-GB') : null;
  });

  /** Se precarga con lo declarado y se reinicia cuando llega un chequeo nuevo. */
  protected readonly choice = linkedSignal<BpaChoice>(() => {
    const adheres = this.details().adheres;
    return adheres === undefined ? 'unset' : adheres ? 'yes' : 'no';
  });
  protected readonly number = linkedSignal(() => this.details().registration_number ?? '');

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): void {
    const choice = this.choice();
    const body: BpaDeclarationRequest =
      choice === 'unset'
        ? { adheres: null }
        : choice === 'yes'
          ? { adheres: true, registration_number: this.number().trim() }
          : { adheres: false };
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.api.declareBpa(this.lot().id, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(describeError(err));
      },
    });
  }
}

/** el error en lenguaje llano */
function describeError(err: HttpErrorResponse): string {
  if (err.status === 0) return 'No connection: check your internet and try again.';
  if (err.status === 401) return 'Your session has ended: log in again to declare.';
  if (err.status === 403) return 'This field is read-only: you cannot declare.';
  if (err.status === 404) return 'We could not find the field.';
  if (err.status >= 500) return 'We could not save right now. Please try again in a moment.';
  return 'Check the data: the registration number can be up to 64 characters long.';
}
