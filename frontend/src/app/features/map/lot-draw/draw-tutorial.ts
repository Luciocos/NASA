import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { OFFLINE_STORAGE } from '../../../core/offline/storage';
import { Icon } from '../../../shared/ui/icon/icon';

/** clave del aviso de que el instructivo ya se cerró una vez */
export const DRAW_TUTORIAL_KEY = 'lotestigo:draw-tutorial:v1';

/**
 * instructivo de la primera vez para trazar el perímetro, en tres pasos cortos. no vuelve a
 * aparecer después de cerrarlo
 */
@Component({
  selector: 'app-draw-tutorial',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <section
        class="card card--raised"
        aria-labelledby="draw-tutorial-title"
        animate.enter="enter-pop"
        animate.leave="leave-fade"
      >
        <h2 id="draw-tutorial-title">Your field in three steps</h2>
        <ol>
          <li>
            <span class="step" aria-hidden="true">1</span>
            <span><strong>Find your field</strong> with the search box or your location.</span>
          </li>
          <li>
            <span class="step" aria-hidden="true">2</span>
            <span><strong>Tap its corners</strong> one by one on the image.</span>
          </li>
          <li>
            <span class="step" aria-hidden="true">3</span>
            <span><strong>Save it</strong> and see what the satellites see.</span>
          </li>
        </ol>
        <button type="button" class="btn btn--primary btn--block" (click)="close()">
          <app-icon name="check" /> Start
        </button>
      </section>
    }
  `,
  styles: `
    :host {
      position: absolute;
      top: 50%;
      left: 50%;
      z-index: calc(var(--z-hud) + 2);
      width: min(21rem, calc(100% - 2rem));
      translate: -50% -50%;
    }
    section {
      padding: var(--space-5);
    }
    h2 {
      margin: 0 0 var(--space-4);
      font-size: var(--text-lg);
    }
    ol {
      display: grid;
      gap: var(--space-3);
      margin: 0 0 var(--space-5);
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      color: var(--ink-2);
    }
    .step {
      display: grid;
      flex: none;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      background: var(--field-50);
      box-shadow: inset 0 0 0 1.5px var(--field-700);
      color: var(--field-800);
      font-size: var(--text-sm);
      font-weight: 800;
    }
  `,
})
export class DrawTutorial {
  private readonly storage = inject(OFFLINE_STORAGE);
  protected readonly open = signal(!this.seen());

  close(): void {
    this.open.set(false);
    try {
      this.storage.setItem(DRAW_TUTORIAL_KEY, '1');
    } catch {
      // sin almacenamiento vuelve a aparecer la próxima vez: no es grave
    }
  }

  private seen(): boolean {
    try {
      return this.storage.getItem(DRAW_TUTORIAL_KEY) === '1';
    } catch {
      return false;
    }
  }
}
