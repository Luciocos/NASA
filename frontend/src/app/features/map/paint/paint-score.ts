import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { OriginBadge } from '../../../shared/origin-badge/origin-badge';

const COUNT_MS = 320;

/**
 * marcador en vivo del modo pintar: hectáreas (con animación de conteo), perímetro y sectores,
 * más el aviso de lo que falta para poder guardar
 */
@Component({
  selector: 'app-paint-score',
  imports: [OriginBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <span class="stat__label">Hectáreas pintadas</span>
      <app-origin-badge origin="DECLARED" />
    </div>
    <p class="big">
      <span aria-hidden="true">{{ format(shown()) }}</span>
      <span class="visually-hidden">{{ format(areaHa()) }} hectáreas</span>
      <span class="stat__unit" aria-hidden="true">ha</span>
    </p>
    <dl>
      <div>
        <dt class="stat__label">Perímetro</dt>
        <dd>{{ perimeter() }}</dd>
      </div>
      <div>
        <dt class="stat__label">Sectores</dt>
        <dd>{{ regions() }}</dd>
      </div>
      <div>
        <dt class="stat__label">Recuadros</dt>
        <dd>{{ cells() }} × {{ cellSize() === 100 ? '1 ha' : '¼ ha' }}</dd>
      </div>
    </dl>
    @if (cells() === 0) {
      <p class="alert alert--info">Pintá al menos un recuadro</p>
    } @else if (regions() > 1) {
      <div class="alert alert--warn" role="alert">
        <p>
          Tus recuadros forman {{ regions() }} sectores separados: unilos o borrá uno para guardar
          el lote
        </p>
        <button type="button" class="btn btn--sm" (click)="keepLargest.emit()">
          Quedarme con el sector más grande
        </button>
      </div>
    } @else {
      <p class="alert alert--ok">Un solo sector: listo para guardar</p>
    }
    <p class="small muted">
      Lo marcás vos sobre la imagen. La superficie final la calcula el servidor sobre el polígono y
      puede variar en el segundo decimal.
    </p>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    p {
      margin: 0;
    }
    .big {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      color: var(--field-700);
      font-size: var(--text-3xl);
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-2);
      margin: 0;
    }
    dd {
      margin: 0;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .alert {
      flex-wrap: wrap;
    }
  `,
})
export class PaintScore {
  readonly areaHa = input.required<number>();
  readonly perimeterM = input.required<number>();
  readonly regions = input.required<number>();
  readonly cells = input.required<number>();
  readonly cellSize = input.required<number>();
  /** el productor pidió dejar solo el sector más grande */
  readonly keepLargest = output();

  /** número que se ve mientras corre la animación de conteo */
  protected readonly shown = signal(0);
  protected readonly perimeter = computed(() => {
    const meters = this.perimeterM();
    return meters >= 1000
      ? `${(meters / 1000).toLocaleString('es-AR', { maximumFractionDigits: 2 })} km`
      : `${meters.toLocaleString('es-AR')} m`;
  });

  private frame = 0;

  constructor() {
    effect(() => {
      const target = this.areaHa();
      untracked(() => this.countTo(target));
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected format(value: number): string {
    return value.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }

  private countTo(target: number): void {
    this.stop();
    const from = this.shown();
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (from === target || reduced || typeof requestAnimationFrame !== 'function') {
      this.shown.set(target);
      return;
    }
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      // redondeo al paso de un cuarto de hectárea para que no se vean decimales sueltos
      this.shown.set(t === 1 ? target : Math.round((from + (target - from) * eased) * 4) / 4);
      this.frame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.frame = requestAnimationFrame(step);
  }

  private stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
