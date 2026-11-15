import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { Api } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { formatHectares } from '../../core/insights';
import { LotOverview, loadOverviews } from '../../core/lot-scene';
import { EventLogItem } from '../../core/models';
import { EventGlyph } from '../../shared/iso/event-glyph';
import { OriginBadge } from '../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../shared/simulated-notice/simulated-notice';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { formatEventDate } from '../lot/labels';
import { OUTLINE_BOX, outlinePath } from './outline';

type ExamplesState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: LotOverview[] };

interface ExampleCard {
  id: number;
  name: string;
  place: string;
  area: string;
  /** contorno del lote para el svg, o null si la geometría no alcanza */
  outline: string | null;
  last: EventLogItem | null;
  lastDate: string;
}

/**
 * /ejemplos (pública): los lotes de ejemplo de la NASA, con su último evento, para ver qué
 * arma LoTestigo sin crear una cuenta. cada tarjeta abre la ficha del lote, de solo lectura
 */
@Component({
  selector: 'app-examples-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeader, OriginBadge, SimulatedNotice, EventGlyph, Icon],
  templateUrl: './examples-page.html',
  styleUrl: './examples-page.css',
})
export class ExamplesPage {
  private readonly api = inject(Api);
  protected readonly auth = inject(AuthService);
  protected readonly box = `0 0 ${OUTLINE_BOX} ${OUTLINE_BOX}`;
  protected readonly placeholders = [0, 1, 2];

  // cada reintento vuelve a pedir la lista con la ficha y la bitácora de cada lote
  private readonly attempt = signal(0);
  protected readonly state = toSignal(
    toObservable(this.attempt).pipe(
      switchMap(() =>
        this.api.exampleLots().pipe(
          switchMap((lots) => loadOverviews(this.api, lots)),
          map((items): ExamplesState => ({ status: 'ready', items })),
          catchError(() => of<ExamplesState>({ status: 'error' })),
          startWith<ExamplesState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as ExamplesState },
  );

  protected readonly cards = computed<ExampleCard[]>(() => {
    const state = this.state();
    if (state.status !== 'ready') return [];
    return state.items.map(({ lot, last }) => ({
      id: lot.id,
      name: lot.name,
      place: [lot.locality, lot.province].filter(Boolean).join(', '),
      area: formatHectares(lot.area_ha),
      outline: outlinePath(lot.geometry),
      last,
      lastDate: last ? formatEventDate(last) : '',
    }));
  });

  protected retry(): void {
    this.attempt.update((count) => count + 1);
  }
}
