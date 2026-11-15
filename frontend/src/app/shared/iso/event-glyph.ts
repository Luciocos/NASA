import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { isoGlyphPath } from './glyphs';
import { IsoGlyph } from './model';

/**
 * glifo de un tipo de evento en svg, el mismo que dibuja la maqueta sobre cada lote. es
 * decorativo: el nombre del evento lo pone quien lo usa
 */
@Component({
  selector: 'app-event-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `<svg viewBox="0 0 24 24" focusable="false"><path [attr.d]="path()" /></svg>`,
  styles: `
    :host {
      display: inline-flex;
      width: var(--glyph-size, 1.25em);
      height: var(--glyph-size, 1.25em);
      flex: none;
    }
    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class EventGlyph {
  readonly type = input.required<IsoGlyph>();
  protected readonly path = computed(() => isoGlyphPath(this.type()));
}
