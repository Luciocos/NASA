import {
  DOCUMENT,
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';

/** margen para redondeos: una tarjeta cuenta como entera aunque le falte un píxel */
const SLACK = 2;

/**
 * pista de tarjetas deslizables: cada hijo directo es una tarjeta y la pista se desplaza de
 * costado con scroll-snap (con el dedo, la rueda o los botones). sabe qué tarjetas se ven
 * enteras para decir "2 de 6" (o "1 a 3 de 6" si entran varias) y para mover la pista de a una
 * tarjeta con `step`, sin animación si se pidió menos movimiento
 *
 * el estilo (ancho de las tarjetas, scroll-snap) lo pone la pantalla que la usa
 *
 * @example
 * <p aria-live="polite">{{ slider.position() }}</p>
 * <button (click)="slider.step(1)" [disabled]="slider.atEnd()">Siguiente</button>
 * <div class="track" appSlideTrack #slider="slideTrack">…tarjetas…</div>
 */
@Directive({
  selector: '[appSlideTrack]',
  exportAs: 'slideTrack',
  host: { '(scroll)': 'onScroll()' },
})
export class SlideTrack {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly view = inject(DOCUMENT).defaultView;

  /** primera y última tarjeta enteras a la vista, desde 0 */
  readonly first = signal(0);
  readonly last = signal(0);
  readonly count = signal(0);
  readonly atStart = computed(() => this.first() <= 0);
  readonly atEnd = computed(() => this.last() >= this.count() - 1);
  /** todas entran a la vez: los botones sobran */
  readonly allVisible = computed(() => this.atStart() && this.atEnd());
  /** "2 de 6", o "1 a 3 de 6" si se ven varias enteras */
  readonly position = computed(() => {
    const total = this.count();
    if (!total) return '';
    const from = this.first() + 1;
    const to = this.last() + 1;
    return from === to ? `${from} de ${total}` : `${from} a ${to} de ${total}`;
  });

  private frame = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.sync();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.sync());
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    destroyRef.onDestroy(() => {
      if (this.frame) this.view?.cancelAnimationFrame(this.frame);
    });
  }

  /** mueve la pista una tarjeta hacia adelante (1) o hacia atrás (-1) */
  step(direction: 1 | -1): void {
    if (direction > 0 ? this.atEnd() : this.atStart()) return;
    const slides = this.slides();
    const index = Math.min(Math.max(this.first() + direction, 0), slides.length - 1);
    const target = slides[index];
    if (!target) return;
    const reduce = this.view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const track = this.host.nativeElement;
    // la primera tarjeta marca el relleno de la pista: así la elegida queda en el mismo lugar.
    // la posición ("2 de 6") la actualizan los eventos de scroll que siguen
    const left = target.offsetLeft - slides[0].offsetLeft;
    if (typeof track.scrollTo === 'function') {
      track.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
    } else {
      track.scrollLeft = left;
    }
  }

  /** vuelve a medir qué tarjetas se ven enteras */
  sync(): void {
    const track = this.host.nativeElement;
    const slides = this.slides();
    this.count.set(slides.length);
    if (!slides.length) return;
    const left = track.scrollLeft;
    const right = left + track.clientWidth;
    let first = -1;
    let last = -1;
    slides.forEach((slide, index) => {
      const start = slide.offsetLeft;
      const end = start + slide.offsetWidth;
      if (start >= left - SLACK && end <= right + SLACK) {
        if (first < 0) first = index;
        last = index;
      }
    });
    if (first < 0) {
      // ninguna entra entera (pantalla muy angosta): cuenta la que empieza más cerca del borde
      const distances = slides.map((slide) => Math.abs(slide.offsetLeft - left));
      first = last = distances.indexOf(Math.min(...distances));
    }
    this.first.set(first);
    this.last.set(last);
  }

  protected onScroll(): void {
    if (!this.view?.requestAnimationFrame) {
      this.sync();
      return;
    }
    if (this.frame) return;
    this.frame = this.view.requestAnimationFrame(() => {
      this.frame = 0;
      this.sync();
    });
  }

  private slides(): HTMLElement[] {
    return [...this.host.nativeElement.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
  }
}
