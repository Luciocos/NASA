import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  inject,
  input,
  signal,
} from '@angular/core';

/** espera tras el último scroll para decir en qué tarjeta quedó (el deslizamiento tiene inercia) */
const SETTLE_MS = 90;

/**
 * tarjetas deslizables con scroll-snap. el host es la pista (con overflow-x en su css) y sus
 * hijos son las tarjetas. dice si hace falta deslizar, en qué tarjeta está y cuántas hay, para
 * mostrar el "2 de 3" y los botones anterior y siguiente; con el dedo se desliza sola. si todas
 * entran, no hay nada que mover y la pista no toma el foco
 *
 * @example
 * <ol class="track" [appSlides]="items.length" #slides="slides">…</ol>
 * @if (slides.overflowing()) { {{ slides.current() + 1 }} de {{ slides.count() }} }
 */
@Directive({
  selector: '[appSlides]',
  exportAs: 'slides',
  host: {
    '[attr.tabindex]': 'overflowing() ? 0 : null',
    '(scroll)': 'settle()',
    '(scrollend)': 'sync()',
  },
})
export class Slides {
  /** cuántas tarjetas hay: cuando cambia, se vuelve a medir */
  readonly count = input(0, { alias: 'appSlides' });

  readonly current = signal(0);
  readonly overflowing = signal(false);

  private readonly track: HTMLElement = inject(ElementRef).nativeElement;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterRenderEffect(() => {
      this.count();
      this.sync();
    });
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.sync());
      observer.observe(this.track);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    destroyRef.onDestroy(() => clearTimeout(this.timer));
  }

  /** va a la tarjeta anterior (-1) o a la siguiente (1) */
  go(step: number): void {
    const items = this.items();
    if (!items.length) return;
    const index = Math.min(items.length - 1, Math.max(0, this.current() + step));
    this.current.set(index);
    // el desplazamiento suave lo pone el css (y se apaga con movimiento reducido)
    this.track.scrollLeft = items[index].offsetLeft - items[0].offsetLeft;
  }

  /** mide si las tarjetas desbordan y cuál quedó más cerca del borde izquierdo */
  sync(): void {
    clearTimeout(this.timer);
    const track = this.track;
    const items = this.items();
    this.overflowing.set(track.scrollWidth > track.clientWidth + 1);
    if (!items.length) {
      this.current.set(0);
      return;
    }
    const left = track.scrollLeft;
    const atEnd = left + track.clientWidth >= track.scrollWidth - 2;
    let nearest = 0;
    items.forEach((item, index) => {
      const distance = Math.abs(item.offsetLeft - items[0].offsetLeft - left);
      const best = Math.abs(items[nearest].offsetLeft - items[0].offsetLeft - left);
      if (distance < best) nearest = index;
    });
    this.current.set(atEnd && left > 0 ? items.length - 1 : nearest);
  }

  protected settle(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), SETTLE_MS);
  }

  private items(): HTMLElement[] {
    return Array.from(this.track.children) as HTMLElement[];
  }
}
