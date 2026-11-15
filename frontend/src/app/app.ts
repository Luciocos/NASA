import { Component, DOCUMENT, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AccountChip } from './core/account/account-chip';
import { ConnectionStatus } from './core/offline/connection-status/connection-status';
import { UpdateToast } from './core/offline/update-toast/update-toast';

/** marco de la app: encabezado con la marca, la navegación y el estado de conexión; pantalla y pie */
@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConnectionStatus, UpdateToast, AccountChip],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);

  /** la landing tiene su propio encabezado y su propio pie */
  protected readonly isLanding = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0] === '/'),
    ),
    // con el valor inicial correcto el encabezado de la app no parpadea al abrir la landing
    { initialValue: inject(DOCUMENT).location?.pathname === '/' },
  );

  protected skipToContent(event: Event, content: HTMLElement): void {
    // con <base href="/">, seguir el enlace llevaría a /#contenido en vez de quedarse en la pantalla
    event.preventDefault();
    content.focus();
  }
}
