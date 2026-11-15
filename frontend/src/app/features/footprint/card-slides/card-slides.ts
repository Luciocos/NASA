import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { Icon } from '../../../shared/ui/icon/icon';

/**
 * tarjetas deslizables: una fila con scroll-snap que en compu muestra todas las que entran y
 * en el celular una por vez, con la siguiente asomada para invitar a deslizar. cuando no
 * entran todas aparecen "Anterior" y "Siguiente" (44 px) y la posición ("2 de 3")
 *
 * accesible: región con nombre y descripción de carrusel; cada hijo directo es un grupo
 * "diapositiva" con su posición como nombre. se pasa de una a otra con el dedo, con la rueda
 * o con los botones; con movimiento reducido el salto es inmediato
 *
 * @example
 * <app-card-slides label="Resumen de la huella">
 *   <app-kpi-card label="Rinde" [value]="7.85" unit="t/ha" />
 *   <app-section-card heading="Qué pesa más" level="3">...</app-section-card>
 * </app-card-slides>
 */
@Component({
  selector: 'app-card-slides',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    role: 'region',
    'aria-roledescription': 'carousel',
    '[attr.aria-label]': 'label()',
  },
  template: `
    <div class="track" #track (scroll)="measure()">
      <ng-content />
    </div>
    @if (overflowing()) {
      <div class="controls">
        <button
          type="button"
          class="btn btn--icon"
          aria-label="Previous"
          [disabled]="index() === 0"
          (click)="go(-1)"
        >
          <app-icon name="chevron-left" />
        </button>
        <p class="count" aria-live="polite">{{ index() + 1 }} of {{ count() }}</p>
        <button
          type="button"
          class="btn btn--icon"
          aria-label="Next"
          [disabled]="atEnd()"
          (click)="go(1)"
        >
          <app-icon name="chevron-right" />
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }
    .track {
      position: relative;
      display: grid;
      grid-auto-columns: minmax(min(86%, var(--slide-min, 20rem)), 1fr);
      grid-auto-flow: column;
      gap: var(--space-4);
      min-width: 0;
      /* aire abajo para la sombra de las tarjetas, que el recorte del scroll se comería */
      padding: 2px 0 var(--space-2);
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
    }
    .track::-webkit-scrollbar {
      display: none;
    }
    .track > ::ng-deep * {
      min-width: 0;
      scroll-snap-align: start;
    }
    .controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
    }
    .count {
      min-width: 4.5rem;
      margin: 0;
      color: var(--ink-3);
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      text-align: center;
    }
    @media (max-width: 40rem) {
      .track {
        gap: var(--space-3);
      }
      .controls {
        justify-content: center;
      }
    }
  `,
})
export class CardSlides {
  /** nombre de la región ("Resumen de la huella") */
  readonly label = input.required<string>();

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  protected readonly count = signal(0);
  protected readonly index = signal(0);
  protected readonly atEnd = signal(true);
  protected readonly overflowing = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const track = this.track().nativeElement;
      this.measure();
      // cambia el ancho (giro del celular, ventana) o cambian las tarjetas: se vuelve a medir
      const resize =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.measure());
      resize?.observe(track);
      const mutation =
        typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => this.measure());
      mutation?.observe(track, { childList: true });
      destroyRef.onDestroy(() => {
        resize?.disconnect();
        mutation?.disconnect();
      });
    });
  }

  /** posición, cantidad y si sobra contenido; nombra cada tarjeta con su lugar ("2 de 3") */
  protected measure(): void {
    const track = this.track().nativeElement;
    const slides = this.slides();
    if (slides.length !== this.count()) {
      slides.forEach((slide, i) => {
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-roledescription', 'slide');
        slide.setAttribute('aria-label', `${i + 1} of ${slides.length}`);
      });
    }
    const max = track.scrollWidth - track.clientWidth;
    this.count.set(slides.length);
    this.overflowing.set(max > 1);
    this.atEnd.set(track.scrollLeft >= max - 1);
    this.index.set(this.closest(slides, track.scrollLeft));
  }

  protected go(step: number): void {
    const track = this.track().nativeElement;
    const slides = this.slides();
    const target = slides[Math.min(Math.max(this.index() + step, 0), slides.length - 1)];
    if (!target) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    track.scrollTo({ left: target.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
  }

  private slides(): HTMLElement[] {
    return [...this.track().nativeElement.children] as HTMLElement[];
  }

  /** la tarjeta cuyo borde izquierdo queda más cerca del inicio visible */
  private closest(slides: HTMLElement[], left: number): number {
    let best = 0;
    slides.forEach((slide, i) => {
      if (Math.abs(slide.offsetLeft - left) < Math.abs(slides[best].offsetLeft - left)) best = i;
    });
    return best;
  }
}
