import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { loginUrl } from '../../../core/auth/return-url';
import { Icon } from '../icon/icon';

/**
 * invitación a ingresar cuando un lote no se pudo abrir (404). sin sesión, el lote puede ser
 * privado: invita a ingresar y después vuelve a esta misma pantalla (/ingresar?volver=<url>).
 * con sesión, el lote no existe o es de otra cuenta: lleva a Mi campo. en los dos casos ofrece
 * los lotes de ejemplo
 *
 * ocupa el lugar del contenido de la pantalla, por eso su título es el h1. no tiene inputs
 *
 * @example
 * @if (notFound()) { <app-login-invite /> }
 */
@Component({
  selector: 'app-login-invite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <section
      class="invite card card--raised"
      aria-labelledby="login-invite-title"
      animate.enter="enter-rise"
    >
      <span class="icon-mark" aria-hidden="true">
        <app-icon [name]="loggedIn() ? 'map' : 'user'" />
      </span>
      @if (loggedIn()) {
        <h1 id="login-invite-title">We couldn't find this field</h1>
        <p>It doesn't exist or belongs to another account. Your fields are in My fields.</p>
        <a class="btn btn--primary btn--lg btn--block" routerLink="/mapa">Go to My fields</a>
      } @else {
        <h1 id="login-invite-title">Log in to see this field</h1>
        <p>Fields are private: only the account that added them can see them.</p>
        <a class="btn btn--primary btn--lg btn--block" [routerLink]="login()">Log in</a>
      }
      <a class="link-arrow" routerLink="/ejemplos">
        See the sample fields <app-icon name="arrow-right" />
      </a>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      padding-block: clamp(var(--space-3), 5vh, var(--space-7));
    }
    .invite {
      display: grid;
      justify-items: center;
      gap: var(--space-3);
      width: min(100%, 27rem);
      padding: clamp(var(--space-5), 5vw, var(--space-6));
      text-align: center;
    }
    h1 {
      margin: 0;
      font-size: var(--text-2xl);
      line-height: 1.2;
      text-wrap: balance;
    }
    p {
      margin: 0 0 var(--space-2);
      color: var(--ink-2);
    }
  `,
})
export class LoginInvite {
  private readonly router = inject(Router);
  protected readonly loggedIn = inject(AuthService).loggedIn;

  /** la pantalla actual, con su query: es adonde se vuelve después de ingresar */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly login = computed(() => loginUrl(this.router, this.url()));
}
