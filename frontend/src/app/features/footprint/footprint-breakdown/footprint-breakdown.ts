import { Component, computed, input } from '@angular/core';

import { Footprint } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { CONFIDENCE_LABELS, formatKgPerTonne, formatNumber, missingSentence } from '../format';

/**
 * Valor por tonelada, desglose por componente con su origen y nivel de confianza. La versión
 * compacta (pasaporte) deja las fuentes largas de las referencias en un plegable al pie en
 * pantalla; al imprimir van en cada fila, como siempre.
 */
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

  /** "Faltan 4 de 7 componentes." sin repetir "No se puede calcular todavía" */
  protected readonly why = computed(() => missingSentence(this.footprint().message));

  /** las referencias con su fuente: el rinde y cada componente que usa un valor de referencia */
  protected readonly references = computed(() => {
    const fp = this.footprint();
    return [
      ...(fp.yield.reference ? [{ name: 'Rendimiento', source: fp.yield.reference }] : []),
      ...fp.components
        .filter((c) => c.activity.reference)
        .map((c) => ({ name: c.label, source: c.activity.reference as string })),
    ];
  });
}
