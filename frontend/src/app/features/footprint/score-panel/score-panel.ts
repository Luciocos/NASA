import { Component, computed, input } from '@angular/core';

import { SustainabilityScore } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { CRITERION_STATUS, formatNumber } from '../format';

/**
 * Puntaje de sustentabilidad provisional: cada criterio con su estado y origen. sin número dice
 * por qué en una línea corta, igual que la pestaña Prácticas; el mensaje del backend va con los
 * criterios
 */
@Component({
  imports: [OriginBadge, SimulatedNotice],
  selector: 'app-score-panel',
  styleUrl: './score-panel.css',
  templateUrl: './score-panel.html',
})
export class ScorePanel {
  readonly score = input.required<SustainabilityScore>();

  /** por qué no hay número, en pocas palabras ('' si hay número) */
  protected readonly hint = computed(() => {
    const score = this.score();
    if (score.score !== null) return '';
    if (!score.weights_defined) return 'Todavía sin pesos definidos.';
    const missing = score.missing_criteria.length;
    if (missing > 0)
      return `Faltan datos de ${missing} ${missing === 1 ? 'práctica' : 'prácticas'}.`;
    return '';
  });

  protected readonly status = CRITERION_STATUS;
  protected readonly formatNumber = formatNumber;
}
