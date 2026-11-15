import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { LotTabKey } from '../../../shared/ui/lot-tabs/lot-tabs';
import { LotWorkspace } from '../lot-workspace/lot-workspace';

/**
 * el espacio del lote como página, para los enlaces directos: /lotes/:id (Satélite),
 * /lotes/:id/bitacora y /lotes/:id/practicas. la pestaña sale de `data.tab` de la ruta. es el
 * mismo encabezado y las mismas pestañas que el popup de Mi campo, con la vuelta a Mi campo (o
 * a Ejemplos) y las pestañas como enlaces a sus rutas
 */
@Component({
  selector: 'app-lot-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LotWorkspace],
  template: `<app-lot-workspace [lotId]="id()" [tab]="tab()" />`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
  `,
})
export class LotPage {
  private readonly route = inject(ActivatedRoute);

  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => Number(params.get('id')))),
    { initialValue: NaN },
  );
  protected readonly tab = toSignal(
    this.route.data.pipe(map((data) => (data['tab'] as LotTabKey | undefined) ?? 'satellite')),
    { initialValue: 'satellite' as LotTabKey },
  );
}
