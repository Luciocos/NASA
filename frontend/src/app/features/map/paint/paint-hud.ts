import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

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
  { tool: 'hand', label: 'Mano', icon: 'hand', key: 'H' },
];

/**
 * barras flotantes del modo pintar: herramientas arriba, tamaño y giro de la grilla abajo
 * no guarda estado: muestra lo que recibe y avisa cada acción
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
      <button
        type="button"
        class="hud__btn"
        [disabled]="!canRedo()"
        title="Rehacer (Ctrl o Cmd + Y)"
        aria-keyshortcuts="Control+Y Meta+Y"
        (click)="redo.emit()"
      >
        <app-icon name="redo" />Rehacer
      </button>
      <button type="button" class="hud__btn" [disabled]="!hasCells()" (click)="clear.emit()">
        <app-icon name="trash" />Limpiar
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

    <div class="hud tune" role="group" aria-label="Grilla de recuadros">
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
      .tools .hud__btn {
        min-width: 3rem;
        padding-inline: var(--space-1);
        font-size: 0.625rem;
      }
    }
  `,
})
export class PaintHud {
  readonly tool = input.required<PaintTool>();
  readonly canUndo = input(false);
  readonly canRedo = input(false);
  readonly hasCells = input(false);
  readonly cellSize = input.required<PaintCellSize>();
  readonly rotation = input(0);
  readonly canAlign = input(false);
  /** zoom insuficiente para pintar: muestra el aviso con el botón para acercar */
  readonly zoomedOut = input(false);

  readonly toolChange = output<PaintTool>();
  readonly undo = output();
  readonly redo = output();
  readonly clear = output();
  readonly cellSizeChange = output<PaintCellSize>();
  /** el control de giro se está moviendo: vista previa */
  readonly rotationInput = output<number>();
  /** el control de giro se soltó */
  readonly rotationCommit = output();
  readonly align = output();
  readonly zoomIn = output();

  protected readonly tools = TOOLS;
  protected readonly minRotation = MIN_ROTATION_DEG;
  protected readonly maxRotation = MAX_ROTATION_DEG;

  protected degrees(value: number): string {
    return `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}°`;
  }
}
