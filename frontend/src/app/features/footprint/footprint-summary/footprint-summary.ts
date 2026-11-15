import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Footprint } from '../../../core/models';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  CONFIDENCE_CHIP,
  CONFIDENCE_LABELS,
  ESTIMATE_NOTICE,
  formatNumber,
  missingItems,
  missingSentence,
} from '../format';
import { HelpTip } from '../help-tip/help-tip';

/**
 * resultado de la huella arriba de todo, en una tarjeta chica: el valor por tonelada grande, o
 * "Todavía no se puede calcular" con lo que falta en chips. debajo, la confianza y el aviso de
 * provisional en chips; el detalle (quién completa cada cosa, cómo se mide la confianza, el
 * descargo) va en las ayudas (i). lo proyectado con `actions` (la acción principal y un
 * enlace) va al costado, o abajo en el celular
 */
@Component({
  selector: 'app-footprint-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HelpTip, Icon, SimulatedNotice],
  host: { '[class.is-missing]': 'footprint().total_kg_co2e_per_t === null' },
  styleUrl: './footprint-summary.css',
  templateUrl: './footprint-summary.html',
})
export class FootprintSummary {
  readonly footprint = input.required<Footprint>();
  /** nivel de los títulos: 2 como página; 3 adentro del popup del lote, debajo de su nombre */
  readonly level = input<2 | 3>(2);
  /** el lote es de quien mira: "lo cargás vos"; en un ejemplo, "lo carga el productor" */
  readonly own = input(true);
  /** campaña elegida en el selector: su id, o null para la última del lote */
  readonly campaignChange = output<number | null>();

  protected readonly notice = ESTIMATE_NOTICE;
  protected readonly confidenceLabels = CONFIDENCE_LABELS;
  protected readonly formatNumber = formatNumber;

  protected readonly confidence = computed(
    () => CONFIDENCE_CHIP[this.footprint().confidence.level],
  );
  protected readonly missing = computed(() => missingItems(this.footprint(), this.own()));
  protected readonly why = computed(() => missingSentence(this.footprint().message));

  protected onCampaign(value: string): void {
    this.campaignChange.emit(value === '' ? null : Number(value));
  }
}
