import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ICON_PATHS, IconName } from './icons';

/**
 * ícono de la interfaz en svg inline. es decorativo (aria-hidden): el texto lo pone quien lo usa
 *
 * @example <app-icon name="brush" />
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'icon', 'aria-hidden': 'true' },
  template: `<svg viewBox="0 0 24 24" focusable="false"><path [attr.d]="path()" /></svg>`,
  styles: `
    :host {
      display: inline-flex;
      width: var(--icon-size, 1.25em);
      height: var(--icon-size, 1.25em);
      flex: none;
    }
    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
}
