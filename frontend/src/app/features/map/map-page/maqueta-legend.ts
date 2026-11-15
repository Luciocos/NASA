import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EventType } from '../../../core/models';
import { EventGlyph } from '../../../shared/iso/event-glyph';
import { IsoGlyph } from '../../../shared/iso/model';
import { EVENT_TYPES, EVENT_TYPE_LABELS } from '../../lot/labels';

/** rótulos cortos para que la leyenda entre en la ayuda chica sin cortar renglones */
const SHORT_LABELS: Partial<Record<EventType, string>> = {
  TILLAGE: 'Remoción',
  COVER_CROP: 'Cobertura',
  LAND_USE_CHANGE: 'Cambio de uso',
};

const GLYPHS: readonly { type: IsoGlyph; label: string }[] = [
  ...EVENT_TYPES.map((type) => ({ type, label: SHORT_LABELS[type] ?? EVENT_TYPE_LABELS[type] })),
  { type: 'NO_DATA', label: 'Sin eventos' },
  { type: 'PENDING', label: 'Sin sincronizar' },
];

/**
 * leyenda de la maqueta de Mi campo, para la ayuda (i) "Cómo leer la maqueta": qué ilustra la
 * textura, qué dice el globo (el mismo glifo que dibuja la maqueta) y qué dice su borde sobre el
 * origen del dato. cada borde se distingue por su forma, no solo por el color. los globos van de
 * a dos columnas y con rótulos cortos, para entrar en la ayuda sin desplazarla
 */
@Component({
  selector: 'app-maqueta-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EventGlyph],
  template: `
    <p>Cada bloque es un lote. Su textura ilustra el último evento: no es una foto de hoy.</p>
    <p class="title">El globo: qué pasó</p>
    <ul class="glyphs">
      @for (item of glyphs; track item.type) {
        <li>
          <span class="mark"><app-event-glyph [type]="item.type" /></span>{{ item.label }}
        </li>
      }
    </ul>
    <p class="title">El borde: de dónde sale el dato</p>
    <ul class="origins">
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle class="verified" cx="12" cy="12" r="8" />
        </svg>
        Llena: verificado por satélite
      </li>
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle class="declared" cx="12" cy="12" r="9" />
          <circle class="declared" cx="12" cy="12" r="5.5" />
        </svg>
        Doble: declarado por el productor
      </li>
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle class="estimated" cx="12" cy="12" r="8" />
        </svg>
        Punteada: estimado (valor de referencia)
      </li>
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle class="plain" cx="12" cy="12" r="6" />
          <circle class="simulated" cx="12" cy="12" r="10" />
        </svg>
        Discontinua: simulado para la demostración
      </li>
    </ul>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-2);
    }
    p {
      margin: 0;
    }
    .title {
      margin-top: var(--space-1);
      color: var(--ink);
      font-weight: 700;
    }
    /* :host gana a los estilos de lista de la ayuda (i) que la envuelve */
    :host .glyphs,
    :host .origins {
      display: grid;
      gap: var(--space-1) var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .glyphs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }
    .mark {
      --glyph-size: 0.9rem;
      display: grid;
      flex: none;
      place-items: center;
      width: 1.5rem;
      height: 1.5rem;
      border: 1.5px solid var(--line-strong);
      border-radius: 50%;
      background: #fff;
      color: var(--ink-2);
    }
    svg {
      flex: none;
      width: 1.5rem;
      height: 1.5rem;
      fill: #fff;
      stroke-width: 2;
    }
    .verified {
      stroke: var(--origin-verified);
      stroke-width: 2.5;
    }
    .declared {
      stroke: var(--origin-declared);
      stroke-width: 1.5;
    }
    .estimated {
      stroke: var(--origin-estimated);
      stroke-dasharray: 0.01 3.6;
      stroke-linecap: round;
      stroke-width: 2.5;
    }
    .plain {
      stroke: var(--ink-3);
      stroke-width: 1.5;
    }
    .simulated {
      fill: none;
      stroke: var(--ink-2);
      stroke-dasharray: 4 3;
      stroke-width: 1.5;
    }
  `,
})
export class MaquetaLegend {
  protected readonly glyphs = GLYPHS;
}
