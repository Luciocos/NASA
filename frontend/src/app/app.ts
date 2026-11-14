import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterOutlet } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { Api } from './core/api';

@Component({
  imports: [RouterOutlet, RouterLink],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly api = inject(Api);

  protected readonly backendStatus = toSignal(
    this.api.health().pipe(
      map(() => 'Backend conectado'),
      catchError(() => of('Backend sin conexión')),
    ),
    { initialValue: 'Conectando con el backend…' },
  );
}
