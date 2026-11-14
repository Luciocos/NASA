import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ConnectionStatus } from './core/offline/connection-status/connection-status';
import { UpdateToast } from './core/offline/update-toast/update-toast';

/** marco de la app: encabezado con la marca, la navegación y el estado de conexión; pantalla y pie */
@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConnectionStatus, UpdateToast],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected skipToContent(event: Event, content: HTMLElement): void {
    // con <base href="/">, seguir el enlace llevaría a /#contenido en vez de quedarse en la pantalla
    event.preventDefault();
    content.focus();
  }
}
