import { Component, input } from '@angular/core';

import { SustainabilityScore } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { CRITERION_STATUS, formatNumber } from '../format';

/** Puntaje de sustentabilidad provisional: cada criterio con su estado y origen. */
@Component({
  imports: [OriginBadge, SimulatedNotice],
  selector: 'app-score-panel',
  styleUrl: './score-panel.css',
  templateUrl: './score-panel.html',
})
export class ScorePanel {
  readonly score = input.required<SustainabilityScore>();

  protected readonly status = CRITERION_STATUS;
  protected readonly formatNumber = formatNumber;
}
