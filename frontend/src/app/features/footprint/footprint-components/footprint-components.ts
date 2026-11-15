import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FootprintComponent, Footprint } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { formatNumber, shortLabel, shortReason } from '../format';
import { HelpTip } from '../help-tip/help-tip';

/**
 * vista "Desglose": una fila de una línea por componente (estado en un chip, nombre, motivo
 * corto o valor, y origen). al tocar la fila se abre el dato de actividad, el factor de emisión
 * con su fuente, el motivo completo y las notas. el rinde va primero porque divide el total.
 * "¿De dónde sale cada dato?" vive en la ayuda (i) del encabezado
 */
@Component({
  selector: 'app-footprint-components',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HelpTip, Icon, OriginBadge, SectionCard, SimulatedNotice],
  styleUrl: './footprint-components.css',
  templateUrl: './footprint-components.html',
})
export class FootprintComponents {
  readonly footprint = input.required<Footprint>();
  /** nivel de los títulos: 2 como página; 3 adentro del popup del lote, debajo de su nombre */
  readonly level = input<2 | 3>(2);

  protected readonly formatNumber = formatNumber;
  protected readonly shortLabel = shortLabel;
  protected readonly shortReason = shortReason;

  /** aporte del componente: por tonelada; sin rinde, lo calculado por hectárea */
  protected contribution(c: FootprintComponent): string | null {
    if (c.status !== 'calculado') return null;
    if (c.kg_co2e_per_t !== null) return `${formatNumber(c.kg_co2e_per_t)} kg CO2e/t`;
    if (c.kg_co2e_per_ha !== null) return `${formatNumber(c.kg_co2e_per_ha)} kg CO2e/ha`;
    return null;
  }

  /** factor con coma decimal: 1.772 se lee "1,772" y no mil setecientos */
  protected factorValue(c: FootprintComponent): string | null {
    const value = c.factor.value;
    if (value === null || value === undefined) return null;
    return `${formatNumber(value, 3)} ${c.factor.unit ?? ''}`.trim();
  }

  /** el dato de actividad del lote, o cuántos registros hay si no se suma en una cantidad */
  protected activity(c: FootprintComponent): string {
    if (c.activity.quantity !== null) {
      return `${formatNumber(c.activity.quantity, 2)} ${c.activity.unit ?? ''}`.trim();
    }
    if (c.activity.records > 0) return `${c.activity.records} registro/s`;
    return 'Sin dato';
  }
}
