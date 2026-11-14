import { Component, input } from '@angular/core';

import { Footprint } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { CONFIDENCE_LABELS, formatKgPerTonne, formatNumber } from '../format';

/** Valor por tonelada, desglose por componente con su origen y nivel de confianza. */
@Component({
  imports: [OriginBadge, SimulatedNotice],
  selector: 'app-footprint-breakdown',
  styleUrl: './footprint-breakdown.css',
  templateUrl: './footprint-breakdown.html',
})
export class FootprintBreakdown {
  readonly footprint = input.required<Footprint>();
  /** Versión resumida (pasaporte): sin la columna de factor. */
  readonly compact = input(false);

  protected readonly confidenceLabels = CONFIDENCE_LABELS;
  protected readonly formatKgPerTonne = formatKgPerTonne;
  protected readonly formatNumber = formatNumber;
}
