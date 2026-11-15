import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { OFFLINE_STORAGE } from '../../../core/offline/storage';
import { Icon } from '../../../shared/ui/icon/icon';

/** clave del aviso de que el instructivo ya se cerró una vez */
export const PAINT_TUTORIAL_KEY = 'lotestigo:paint-tutorial:v1';

/** instructivo de tres pasos que aparece la primera vez y no vuelve después de cerrarlo */
@Component({
  selector: 'app-paint-tutorial',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <section
        class="card card--raised"
        aria-labelledby="paint-tutorial-title"
        animate.enter="enter-pop"
        animate.leave="leave-fade"
      >
        <h2 id="paint-tutorial-title">Marcá tu lote en tres pasos</h2>
        <ol>
          <li>
            <app-icon name="brush" />
            <span
              ><strong>Elegí el pincel</strong> en la barra o con la tecla
              <kbd class="kbd">B</kbd>.</span
            >
          </li>
          <li>
            <app-icon name="grid" />
            <span><strong>Pintá tus hectáreas</strong> arrastrando sobre la imagen satelital.</span>
          </li>
          <li>
            <app-icon name="save" />
            <span><strong>Poné nombre y guardá</strong> desde el formulario.</span>
          </li>
        </ol>
        <button type="button" class="btn btn--primary btn--sm" (click)="close()">Entendido</button>
      </section>
    }
  `,
  styles: `
    :host {
      position: absolute;
      top: 50%;
      left: 50%;
      z-index: var(--z-hud);
      width: min(22rem, calc(100% - 2rem));
      translate: -50% -50%;
    }
    h2 {
      margin: 0 0 var(--space-3);
      font-size: var(--text-lg);
    }
    ol {
      display: grid;
      gap: var(--space-3);
      margin: 0 0 var(--space-4);
      padding: 0;
      list-style: none;
    }
    li {
      --icon-size: 1.5rem;
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      color: var(--ink-2);
      font-size: var(--text-sm);
    }
    app-icon {
      color: var(--field-700);
    }
  `,
})
export class PaintTutorial {
  private readonly storage = inject(OFFLINE_STORAGE);
  protected readonly open = signal(!this.seen());

  close(): void {
    this.open.set(false);
    try {
      this.storage.setItem(PAINT_TUTORIAL_KEY, '1');
    } catch {
      // sin almacenamiento vuelve a aparecer la próxima vez: no es grave
    }
  }

  private seen(): boolean {
    try {
      return this.storage.getItem(PAINT_TUTORIAL_KEY) === '1';
    } catch {
      return false;
    }
  }
}
