import { Component, computed, input } from '@angular/core';

import { ORIGIN_LABELS, Origin } from '../../core/models';

/**
 * Etiqueta de origen del dato. Obligatoria en todo dato mostrado (CLAUDE.md, sección 11).
 * Muestra siempre texto: el significado no depende solo del color.
 */
@Component({
  selector: 'app-origin-badge',
  styleUrl: './origin-badge.css',
  templateUrl: './origin-badge.html',
})
export class OriginBadge {
  readonly origin = input.required<Origin>();
  protected readonly label = computed(() => ORIGIN_LABELS[this.origin()]);
}
