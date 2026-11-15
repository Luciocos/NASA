import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';

import { LoginInvite } from '../../../shared/ui/login-invite/login-invite';

/** 'not-found': no existe, es de otra cuenta o falta ingresar (el backend no distingue) */
export type LotLoadError = 'not-found' | 'failed';

/**
 * lo que muestra el espacio del lote mientras su ficha no está: la invitación a ingresar si el
 * lote no existe o es de otra cuenta (404), el aviso con Reintentar si falló la red, o el
 * esqueleto mientras carga (en una página, con la vuelta, el título y las pestañas)
 *
 * @example
 * @if (lot(); as lot) { … } @else {
 *   <app-lot-status [error]="error()" (retry)="reload()" />
 * }
 */
@Component({
  selector: 'app-lot-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoginInvite],
  template: `
    @switch (error()) {
      @case ('not-found') {
        <app-login-invite />
      }
      @case ('failed') {
        <div class="alert alert--error failure" role="alert">
          <p>Couldn't load the field. Check your connection and try again.</p>
          <button type="button" class="btn btn--sm" (click)="retry.emit()">Try again</button>
        </div>
      }
      @default {
        <div class="loading" aria-busy="true">
          @if (!dialog()) {
            <span class="skeleton loading__back"></span>
          }
          <span class="skeleton loading__title"></span>
          <span class="skeleton loading__tabs"></span>
          <span class="skeleton loading__card"></span>
          <p class="visually-hidden" role="status">Loading field…</p>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    p {
      margin: 0;
    }
    .failure {
      flex-wrap: wrap;
      align-items: center;
      border-radius: var(--radius-md);
    }
    .loading {
      display: grid;
      gap: var(--space-3);
    }
    .loading__back {
      width: 7rem;
      height: 1.25rem;
    }
    .loading__title {
      width: min(22rem, 70%);
      height: 2rem;
    }
    .loading__tabs {
      width: min(40rem, 100%);
      height: var(--tap);
      margin-top: var(--space-2);
      border-radius: var(--radius-sm);
    }
    .loading__card {
      height: 22rem;
      margin-top: var(--space-3);
      border-radius: var(--radius-lg);
    }
  `,
})
export class LotStatus {
  readonly error = input<LotLoadError | null>(null);
  /** adentro del popup: sin el esqueleto de la vuelta */
  readonly dialog = input(false, { transform: booleanAttribute });
  readonly retry = output<void>();
}
