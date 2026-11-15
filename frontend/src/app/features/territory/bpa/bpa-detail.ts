import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { LotDetail } from '../../../core/models';
import { TerritorialCheck } from '../territory.types';

/** Detalle propio del chequeo 'bpa' dentro del panel de chequeos territoriales. */
@Component({
  selector: 'app-bpa-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ``,
})
export class BpaDetail {
  readonly check = input.required<TerritorialCheck>();
  readonly lot = input.required<LotDetail>();
  /** true si el usuario es dueño del lote y puede declarar. */
  readonly editable = input(false);
  /** Avisa al panel que vuelva a pedir los chequeos (por ejemplo, después de declarar). */
  readonly changed = output<void>();
}
