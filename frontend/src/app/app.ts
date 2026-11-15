import { Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationError, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { AccountChip } from './core/account/account-chip';
import { AuthService } from './core/auth/auth.service';
import { ConnectionStatus } from './core/offline/connection-status/connection-status';
import { UpdateToast } from './core/offline/update-toast/update-toast';
import { Icon } from './shared/ui/icon/icon';

/** sección del marco que se marca como activa en la navegación */
export type AppSection = 'field' | 'draw' | null;

/**
 * marco de la app: barra superior clara y la pantalla. con sesión, la barra lleva la marca, Mi
 * campo, Marcar lote, el estado de conexión y la cuenta; en el celular la navegación y la
 * cuenta bajan a una barra de pestañas fija (Mi campo, Marcar lote, Cuenta). sin sesión, solo
 * la marca e "Ingresar"
 */
@Component({
  imports: [RouterOutlet, RouterLink, ConnectionStatus, UpdateToast, AccountChip, Icon],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
  host: { '[class.has-tabbar]': 'loggedIn() && !isLanding()' },
})
export class App {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** hay un productor con la sesión abierta */
  protected readonly loggedIn = this.auth.loggedIn;

  /** ruta actual sin query ni fragmento */
  protected readonly path = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    // con el valor inicial correcto el encabezado de la app no parpadea al abrir la landing
    { initialValue: inject(DOCUMENT).location?.pathname ?? '/' },
  );

  /** la landing tiene su propio encabezado y su propio pie */
  protected readonly isLanding = computed(() => this.path() === '/');

  /** Mi campo abarca también la ficha, la huella y las demás pantallas de cada lote */
  protected readonly section = computed<AppSection>(() => {
    const path = this.path();
    if (path === '/mapa/nuevo') return 'draw';
    if (path === '/mapa' || path.startsWith('/lotes/') || path.startsWith('/huella/')) {
      return 'field';
    }
    return null;
  });

  /**
   * una pantalla que no se pudo abrir, por ejemplo sin conexión y sin el código de una pantalla
   * que no se visitó. el aviso se va al cerrarlo o con la próxima navegación que funcione
   */
  protected readonly navigationFailed = signal(false);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationError) this.navigationFailed.set(true);
      else if (event instanceof NavigationEnd) this.navigationFailed.set(false);
    });
  }

  protected skipToContent(event: Event, content: HTMLElement): void {
    // con <base href="/">, seguir el enlace llevaría a /#contenido en vez de quedarse en la pantalla
    event.preventDefault();
    content.focus();
  }
}
