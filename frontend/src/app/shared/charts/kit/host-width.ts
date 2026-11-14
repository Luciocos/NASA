import { DestroyRef, ElementRef, Signal, afterNextRender, inject, signal } from '@angular/core';

/** ancho con el que se dibuja donde no se puede medir (jsdom, contenedor oculto) */
export const DEFAULT_CHART_WIDTH = 640;

/** por debajo de este ancho el dibujo ya no se recalcula: se achica con el svg */
export const MIN_CHART_WIDTH = 260;

let nextId = 0;

/** identificador único por instancia, para los id de tramas y títulos dentro del documento */
export function nextChartId(prefix = 'chart'): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

/**
 * ancho real del elemento anfitrión, como signal. hay que llamarla en un contexto de
 * inyección (inicializador de campo o constructor del componente). mide una vez apenas
 * se dibuja, antes del primer pintado, y después sigue los cambios con ResizeObserver.
 * un ancho cero (contenedor oculto) no pisa el último valor conocido
 */
export function injectHostWidth(fallback = DEFAULT_CHART_WIDTH): Signal<number> {
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const destroyRef = inject(DestroyRef);
  const width = signal(fallback);

  const apply = (measured: number) => {
    if (measured > 0) {
      width.set(Math.max(MIN_CHART_WIDTH, Math.floor(measured)));
    }
  };

  afterNextRender({
    read: () => {
      apply(host.getBoundingClientRect().width);
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (entry) {
          apply(entry.contentRect.width);
        }
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    },
  });

  return width.asReadonly();
}
