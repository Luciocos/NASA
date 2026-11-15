import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { LotDetail } from '../../../core/models';
import { TerritorialCheck } from '../territory.types';

/** Detalle propio del chequeo 'periurban' dentro del panel de chequeos territoriales. */
@Component({
  selector: 'app-periurban-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ``,
})
export class PeriurbanDetail {
  readonly check = input.required<TerritorialCheck>();
  readonly lot = input.required<LotDetail>();
  /** true si el usuario es dueño del lote y puede declarar. */
  readonly editable = input(false);
}
