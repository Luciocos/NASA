import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Footprint, FootprintComponent, Origin } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { CardSlides } from '../card-slides/card-slides';
import { CONFIDENCE_LABELS, formatNumber, shortLabel } from '../format';
import { HelpTip } from '../help-tip/help-tip';

/** un componente calculado en "Qué pesa más" */
interface Weight {
  key: string;
  label: string;
  /** el número con coma decimal; la unidad va una vez, en el subtítulo de la tarjeta */
  amount: string;
  unit: string;
  /** "52 %" del total, solo si el total se pudo calcular */
  percent: string | null;
  /** largo de la barra, relativo al componente que más pesa */
  width: number;
  origin: Origin | null;
  simulated: boolean;
}

/** cuántos componentes muestra "Qué pesa más" */
const TOP = 4;

/**
 * vista "Resumen" de la huella: tres tarjetas deslizables con lo que más pesa, el rinde que
 * divide el total y de dónde salen los datos. solo ordena lo que manda el backend. las
 * explicaciones van en ayudas (i); "ver Desglose" pide a la página cambiar de vista
 */
@Component({
  selector: 'app-footprint-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardSlides, HelpTip, Icon, KpiCard, OriginBadge, SectionCard, SimulatedNotice],
  styleUrl: './footprint-overview.css',
  templateUrl: './footprint-overview.html',
})
export class FootprintOverview {
  readonly footprint = input.required<Footprint>();
  /** nivel de los títulos: 2 como página; 3 adentro del popup del lote, debajo de su nombre */
  readonly level = input<2 | 3>(2);
  /** "Faltan 2 de 7 componentes: ver Desglose" */
  readonly showBreakdown = output<void>();

  protected readonly confidenceLabels = CONFIDENCE_LABELS;

  /** sin rinde no hay valor por tonelada: se muestra lo calculado por hectárea */
  protected readonly perTonne = computed(() => this.footprint().yield.value !== null);

  protected readonly weights = computed<Weight[]>(() => {
    const fp = this.footprint();
    const perTonne = this.perTonne();
    const unit = perTonne ? 'kg CO2e/t' : 'kg CO2e/ha';
    const rows = fp.components
      .filter((c) => c.status === 'calculado')
      .map((c) => ({ c, value: perTonne ? c.kg_co2e_per_t : c.kg_co2e_per_ha }))
      .filter((row): row is { c: FootprintComponent; value: number } => row.value !== null)
      .sort((a, b) => b.value - a.value);
    const max = Math.max(0, ...rows.map((row) => row.value));
    const total = fp.total_kg_co2e_per_t;
    // los que más pesan; el resto se ve en Desglose
    return rows.slice(0, TOP).map(({ c, value }) => ({
      key: c.key,
      label: shortLabel(c),
      amount: formatNumber(value),
      unit,
      percent: perTonne && total ? `${formatNumber((value / total) * 100, 0)} %` : null,
      width: max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0,
      origin: c.activity.origin,
      simulated: c.is_simulated,
    }));
  });

  protected readonly missingCount = computed(
    () => this.footprint().components.filter((c) => c.status === 'sin_dato').length,
  );
}
