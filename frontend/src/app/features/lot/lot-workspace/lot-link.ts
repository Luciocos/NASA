import { Directive, computed, inject, input } from '@angular/core';
import { Params, Router } from '@angular/router';

import { LOT_TAB_SLUGS, LotTabKey } from '../../../shared/ui/lot-tabs/lot-tabs';

/**
 * dirección del popup del lote, sobre la pantalla que lo abre: /mapa?lote=12&seccion=huella.
 * `vista` es la vista interna de la huella: se limpia al cambiar de pestaña y al cerrar
 */
export const LOT_PARAM = 'lote';
export const LOT_TAB_PARAM = 'seccion';
export const LOT_INNER_PARAM = 'vista';

/**
 * marca de la entrada del historial que sumó la app al abrir el popup: con ella, Cerrar vuelve
 * atrás (y adelante lo reabre); sin ella (un enlace pegado), Cerrar reemplaza la dirección
 */
export const LOT_DIALOG_STATE = 'lotDialog';

/** los parámetros que abren (o, con null, cierran) el popup en una pestaña */
export function lotDialogParams(lotId: number | null, tab: LotTabKey = 'satellite'): Params {
  return {
    [LOT_PARAM]: lotId,
    [LOT_TAB_PARAM]: lotId === null || tab === 'satellite' ? null : LOT_TAB_SLUGS[tab],
    [LOT_INNER_PARAM]: null,
  };
}

/**
 * abre el lote en el popup, encima de la pantalla actual. suma una entrada al historial (atrás
 * lo cierra) y no mueve el desplazamiento de la pantalla de atrás
 */
export function openLot(router: Router, lotId: number, tab: LotTabKey = 'satellite'): void {
  void router.navigate([], {
    queryParams: lotDialogParams(lotId, tab),
    queryParamsHandling: 'merge',
    state: { [LOT_DIALOG_STATE]: true },
    scroll: 'manual',
  });
}

/**
 * enlace que abre un lote en el popup ("Ver lote", "Ver su historia"). conserva el href real
 * (abrir en otra pestaña o copiar el enlace lleva a la misma pantalla con el popup abierto);
 * el clic común abre el popup sin cambiar de pantalla
 *
 * @example <a class="btn" [appLotLink]="lot.id">Ver lote</a>
 */
@Directive({
  selector: 'a[appLotLink]',
  host: {
    '[attr.href]': 'href()',
    'aria-haspopup': 'dialog',
    '(click)': 'onClick($event)',
  },
})
export class LotLink {
  private readonly router = inject(Router);

  readonly lotId = input.required<number>({ alias: 'appLotLink' });
  /** la pestaña con la que abre; Satélite si falta */
  readonly lotTab = input<LotTabKey>('satellite');

  protected readonly href = computed(() =>
    this.router.serializeUrl(
      this.router.createUrlTree([], {
        queryParams: lotDialogParams(this.lotId(), this.lotTab()),
        queryParamsHandling: 'merge',
      }),
    ),
  );

  protected onClick(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    openLot(this.router, this.lotId(), this.lotTab());
  }
}
