import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { Icon } from '../../../shared/ui/icon/icon';
import { MAX_ROTATION_DEG, MIN_ROTATION_DEG, PaintCellSize } from './paint-session';

/** herramienta activa del modo pintar */
export type PaintTool = 'brush' | 'eraser' | 'hand';

interface ToolButton {
  tool: PaintTool;
  label: string;
  icon: 'brush' | 'eraser' | 'hand';
  key: string;
}

const TOOLS: readonly ToolButton[] = [
  { tool: 'brush', label: 'Pincel', icon: 'brush', key: 'B' },
  { tool: 'eraser', label: 'Borrador', icon: 'eraser', key: 'E' },
  { tool: 'hand', label: 'Mover', icon: 'hand', key: 'H' },
];

let nextId = 0;

/**
 * barra compacta del modo pintar: pincel, borrador y mover, deshacer y empezar de nuevo. el
 * tamaño y el giro de la grilla se piden con "Grilla" y aparecen abajo. rehacer queda en el
 * teclado (Ctrl o Cmd + Y). no guarda estado del lote: muestra lo que recibe y avisa cada acción
 */
@Component({
  selector: 'app-paint-hud',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hud tools" role="toolbar" aria-label="Herramientas para pintar">
      @for (item of tools; track item.tool) {
        <button
          type="button"
          class="hud__btn"
          [attr.aria-pressed]="tool() === item.tool"
          [attr.aria-keyshortcuts]="item.key"
          [title]="item.label + ' (' + item.key + ')'"
          (click)="toolChange.emit(item.tool)"
        >
          <app-icon [name]="item.icon" />{{ item.label }}
        </button>
      }
      <span class="hud__sep" aria-hidden="true"></span>
      <button
        type="button"
        class="hud__btn"
        [disabled]="!canUndo()"
        title="Deshacer (Ctrl o Cmd + Z)"
        aria-keyshortcuts="Control+Z Meta+Z"
        (click)="undo.emit()"
      >
        <app-icon name="undo" />Deshacer
      </button>
      <button type="button" class="hud__btn" [disabled]="!hasCells()" (click)="clear.emit()">
        <app-icon name="trash" />De nuevo
      </button>
      <span class="hud__sep" aria-hidden="true"></span>
      <button
        type="button"
        class="hud__btn"
        [attr.aria-expanded]="tuneOpen()"
        [attr.aria-controls]="tuneId"
        title="Tamaño y giro de la grilla"
        (click)="tuneOpen.set(!tuneOpen())"
      >
        <app-icon name="grid" />Grilla
      </button>
    </div>

    @if (zoomedOut()) {
      <div class="gate" role="status">
        <p>Acercate para pintar hectáreas</p>
        <button type="button" class="btn btn--primary btn--sm" (click)="zoomIn.emit()">
          <app-icon name="zoom-in" /> Acercar
        </button>
      </div>
    }

    <div
      class="hud tune"
      role="group"
      aria-label="Grilla de recuadros"
      [id]="tuneId"
      [hidden]="!tuneOpen()"
    >
      <div class="seg" role="group" aria-label="Tamaño del recuadro">
        <button
          type="button"
          [attr.aria-pressed]="cellSize() === 100"
          title="Recuadros de 100 m: una hectárea"
          (click)="cellSizeChange.emit(100)"
        >
          1 ha
        </button>
        <button
          type="button"
          [attr.aria-pressed]="cellSize() === 50"
          title="Recuadros de 50 m: un cuarto de hectárea"
          (click)="cellSizeChange.emit(50)"
        >
          ¼ ha
        </button>
      </div>
      <label class="turn">
        <app-icon name="rotate" />
        <span class="visually-hidden">Giro de la grilla</span>
        <input
          type="range"
          step="0.5"
          [min]="minRotation"
          [max]="maxRotation"
          [value]="rotation()"
          [attr.aria-valuetext]="degrees(rotation())"
          (input)="rotationInput.emit(+$any($event.target).value)"
          (change)="rotationCommit.emit()"
        />
        <output aria-hidden="true">{{ degrees(rotation()) }}</output>
      </label>
      <button
        type="button"
        class="btn btn--sm"
        [disabled]="!canAlign()"
        title="Gira la grilla para que los recuadros sigan los alambrados"
        (click)="align.emit()"
      >
        Alinear con el lote
      </button>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: var(--space-3);
      z-index: var(--z-hud);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-3);
      pointer-events: none;
    }
    .hud,
    .gate {
      pointer-events: auto;
      max-width: calc(100% - 3.5rem);
    }
    .tools .hud__btn {
      min-width: 3.5rem;
      min-height: 3rem;
      padding-inline: var(--space-1);
    }
    .tools .hud__btn[aria-expanded='true'] {
      background: var(--night-700);
      color: var(--ink);
    }
    .gate {
      display: grid;
      align-self: center;
      justify-items: center;
      gap: var(--space-2);
      padding: var(--space-4) var(--space-5);
      border-radius: var(--radius-lg);
      background: var(--night-glass);
      box-shadow: var(--shadow-hud);
      color: var(--night-ink);
      font-weight: 700;
    }
    .gate p {
      margin: 0;
    }
    .tune {
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
    }
    .tune[hidden] {
      display: none;
    }
    .turn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--ink);
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
    }
    input {
      width: 8rem;
      accent-color: var(--accent);
    }
    output {
      min-width: 3.5ch;
      text-align: right;
    }
    @media (max-width: 40rem) {
      .hud,
      .gate {
        max-width: 100%;
      }
      .tools .hud__btn {
        min-width: 2.9rem;
        font-size: 0.5625rem;
        letter-spacing: 0.02em;
      }
    }
  `,
})
export class PaintHud {
  readonly tool = input.required<PaintTool>();
  readonly canUndo = input(false);
  readonly hasCells = input(false);
  readonly cellSize = input.required<PaintCellSize>();
  readonly rotation = input(0);
  readonly canAlign = input(false);
  /** zoom insuficiente para pintar: muestra el aviso con el botón para acercar */
  readonly zoomedOut = input(false);

  readonly toolChange = output<PaintTool>();
  readonly undo = output();
  readonly clear = output();
  readonly cellSizeChange = output<PaintCellSize>();
  /** el control de giro se está moviendo: vista previa */
  readonly rotationInput = output<number>();
  /** el control de giro se soltó */
  readonly rotationCommit = output();
  readonly align = output();
  readonly zoomIn = output();

  /** tamaño y giro de la grilla, a pedido */
  protected readonly tuneOpen = signal(false);
  protected readonly tuneId = `paint-tune-${nextId++}`;
  protected readonly tools = TOOLS;
  protected readonly minRotation = MIN_ROTATION_DEG;
  protected readonly maxRotation = MAX_ROTATION_DEG;

  protected degrees(value: number): string {
    return `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}°`;
  }
}
