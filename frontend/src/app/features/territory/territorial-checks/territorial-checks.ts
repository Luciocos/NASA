import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { LotDetail, Origin } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icons';
import { InfoTip } from '../../../shared/ui/info-tip/info-tip';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { BpaDetail } from '../bpa/bpa-detail';
import { OtbnDetail } from '../otbn/otbn-detail';
import { PeriurbanDetail } from '../periurban/periurban-detail';
import { TerritoryApi } from '../territory-api';
import {
  CHECK_ORIGIN_LABELS,
  CHECK_STATUS_LABELS,
  CheckKey,
  TerritorialChecks as ChecksResponse,
  TerritorialCheck,
} from '../territory.types';

/** nombre corto de cada chequeo para la fila; el título completo va adentro */
const SHORT_TITLES: Record<CheckKey, string> = {
  periurban: 'Distance to urban areas',
  otbn: 'Native forest (OTBN)',
  bpa: 'Good practices (BPA)',
};

/** cómo se ve un estado: chip con ícono y texto, el significado nunca solo por color */
interface StatusLook {
  label: string;
  icon: IconName;
  chip: string;
}

/**
 * Panel "Chequeos territoriales": cruces indicativos del lote con capas públicas (OTBN,
 * distancias periurbanas) y la adhesión declarada a BPA. Cada chequeo tiene su componente de
 * detalle; este panel solo muestra estado, resumen, origen y fuentes.
 *
 * en pantalla: una fila compacta por chequeo con su nombre corto, el estado en un chip y su
 * origen, y el resto plegado en la misma fila (el resumen, el detalle de cada chequeo y las
 * fuentes). el detalle se arma recién al abrir la fila. la alerta fuerte del OTBN (posible
 * desmonte) queda a la vista en una línea. se vuelve a pedir cuando cambia la ficha del lote: el
 * OTBN usa la declaración de uso del suelo
 */
@Component({
  selector: 'app-territorial-checks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SectionCard,
    InfoTip,
    Icon,
    OriginBadge,
    SimulatedNotice,
    PeriurbanDetail,
    OtbnDetail,
    BpaDetail,
  ],
  templateUrl: './territorial-checks.html',
  styleUrl: './territorial-checks.css',
})
export class TerritorialChecks {
  private readonly api = inject(TerritoryApi);

  readonly lot = input.required<LotDetail>();
  readonly editable = input(false, { transform: booleanAttribute });

  protected readonly data = signal<ChecksResponse | null>(null);
  protected readonly error = signal(false);
  protected readonly statusLabels = CHECK_STATUS_LABELS;
  protected readonly originLabels = CHECK_ORIGIN_LABELS;
  /** las filas abiertas: su detalle recién se arma al abrirlas */
  private readonly open = signal<ReadonlySet<CheckKey>>(new Set());
  /** sube con cada reintento y después de declarar BPA */
  private readonly attempt = signal(0);

  constructor() {
    // la ficha entera: si cambia la declaración de uso del suelo, el OTBN cambia con ella
    effect((onCleanup) => {
      const lot = this.lot();
      this.attempt();
      untracked(() => {
        this.error.set(false);
        // lo de otro lote no se muestra mientras llega lo de este
        if (this.data()?.lot !== lot.id) this.data.set(null);
      });
      const subscription = this.api.checks(lot.id).subscribe({
        next: (data) => this.data.set(data),
        error: () => this.error.set(true),
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected reload(): void {
    this.attempt.update((value) => value + 1);
  }

  protected onToggle(key: CheckKey, event: Event): void {
    const opened = (event.target as HTMLDetailsElement).open;
    this.open.update((current) => {
      const next = new Set(current);
      if (opened) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  protected isOpen(key: CheckKey): boolean {
    return this.open().has(key);
  }

  protected shortTitle(check: TerritorialCheck): string {
    return SHORT_TITLES[check.key] ?? check.title;
  }

  /** el origen con la etiqueta de siempre; una capa pública no es un origen de la app: null */
  protected badgeOrigin(check: TerritorialCheck): Origin | null {
    return check.origin === 'OFFICIAL_LAYER' ? null : check.origin;
  }

  /** superposición con bosque protegido y cambio de uso (detectado o declarado) */
  protected strongAlert(check: TerritorialCheck): boolean {
    return check.key === 'otbn' && check.details['strong_alert'] === true;
  }

  /**
   * la alerta usa algún evento simulado de la bitácora: la línea a la vista lleva la leyenda de
   * dato simulado (CLAUDE.md, sección 13), no solo el detalle plegado
   */
  protected simulatedAlert(check: TerritorialCheck): boolean {
    const events = check.details['land_use_change_events'];
    return (
      Array.isArray(events) &&
      events.some((event) => (event as { is_simulated?: unknown } | null)?.is_simulated === true)
    );
  }

  /** el dueño todavía no declaró BPA: la fila invita a hacerlo */
  protected invitesDeclaring(check: TerritorialCheck): boolean {
    return check.key === 'bpa' && check.status === 'NO_DATA' && this.editable();
  }

  protected statusLook(check: TerritorialCheck): StatusLook {
    if (this.strongAlert(check)) {
      return { label: 'Possible clearing', icon: 'alert', chip: 'chip--danger' };
    }
    switch (check.status) {
      case 'CLEAR':
        return { label: this.statusLabels.CLEAR, icon: 'check', chip: 'chip--ok' };
      case 'POSSIBLE_CONFLICT':
        return { label: this.statusLabels.POSSIBLE_CONFLICT, icon: 'alert', chip: 'chip--warn' };
      default:
        return {
          label: check.key === 'bpa' ? 'Not declared' : this.statusLabels.NO_DATA,
          icon: 'minus',
          chip: '',
        };
    }
  }
}
