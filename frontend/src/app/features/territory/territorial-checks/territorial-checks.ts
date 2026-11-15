import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';

import { LotDetail } from '../../../core/models';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { BpaDetail } from '../bpa/bpa-detail';
import { OtbnDetail } from '../otbn/otbn-detail';
import { PeriurbanDetail } from '../periurban/periurban-detail';
import { TerritoryApi } from '../territory-api';
import {
  CHECK_ORIGIN_LABELS,
  CHECK_STATUS_LABELS,
  TerritorialChecks as ChecksResponse,
} from '../territory.types';

/**
 * Panel "Chequeos territoriales": cruces indicativos del lote con capas públicas (OTBN,
 * distancias periurbanas) y la adhesión declarada a BPA. Cada chequeo tiene su componente de
 * detalle; este panel solo muestra estado, resumen, origen y fuentes.
 */
@Component({
  selector: 'app-territorial-checks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionCard, PeriurbanDetail, OtbnDetail, BpaDetail],
  templateUrl: './territorial-checks.html',
  styleUrl: './territorial-checks.css',
})
export class TerritorialChecks {
  private readonly api = inject(TerritoryApi);

  readonly lot = input.required<LotDetail>();
  readonly editable = input(false);

  protected readonly data = signal<ChecksResponse | null>(null);
  protected readonly error = signal(false);
  protected readonly statusLabels = CHECK_STATUS_LABELS;
  protected readonly originLabels = CHECK_ORIGIN_LABELS;

  constructor() {
    effect(() => this.load(this.lot().id));
  }

  protected reload(): void {
    this.load(this.lot().id);
  }

  private load(lotId: number): void {
    this.error.set(false);
    this.api.checks(lotId).subscribe({
      next: (data) => this.data.set(data),
      error: () => this.error.set(true),
    });
  }
}
