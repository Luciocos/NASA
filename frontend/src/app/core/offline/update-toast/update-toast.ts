import { Component, DOCUMENT, InjectionToken, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';

/** recarga la página. es un token para que las pruebas no recarguen de verdad */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => {
    const page = inject(DOCUMENT);
    return () => page.location.reload();
  },
});

/**
 * aviso fijo abajo cuando el service worker ya bajó una versión nueva de la app, con un botón
 * para recargar. también avisa si la copia local quedó incompleta y hay que recargar para seguir
 *
 * sin service worker (ng serve, pruebas) no muestra nada
 */
@Component({
  selector: 'app-update-toast',
  styleUrl: './update-toast.css',
  templateUrl: './update-toast.html',
  // la región viva tiene que existir antes que el aviso para que el lector de pantalla lo anuncie
  host: { 'aria-live': 'polite' },
})
export class UpdateToast {
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly reloadPage = inject(RELOAD_PAGE);

  protected readonly notice = signal<'update' | 'broken' | null>(null);

  constructor() {
    this.updates?.versionUpdates.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'VERSION_READY') this.notice.set('update');
    });
    // el navegador borró parte de la copia local: solo una recarga la vuelve a armar
    this.updates?.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => {
      this.notice.set('broken');
    });
  }

  protected reload(): void {
    this.reloadPage();
  }

  protected dismiss(): void {
    this.notice.set(null);
  }
}
