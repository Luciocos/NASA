import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EventGlyph } from '../../../shared/iso/event-glyph';
import { IsoGlyph } from '../../../shared/iso/model';
import { EVENT_TYPES, EVENT_TYPE_LABELS } from '../../lot/labels';

const GLYPHS: readonly { type: IsoGlyph; label: string }[] = [
  ...EVENT_TYPES.map((type) => ({ type, label: EVENT_TYPE_LABELS[type] })),
  { type: 'NO_DATA', label: 'Sin eventos todavía' },
  { type: 'PENDING', label: 'Sin sincronizar' },
];

/**
 * leyenda de la maqueta de Mi campo, para el plegable "Cómo leer la maqueta": qué ilustra la
 * textura, qué dice el globo (el mismo glifo que dibuja la maqueta) y qué dice su borde sobre el
 * origen del dato. cada borde se distingue por su forma, no solo por el color
 */
@Component({
  selector: 'app-maqueta-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EventGlyph],
  template: `
    <p>
      Cada bloque es un lote. Su textura ilustra el último evento registrado: no es una foto de hoy.
    </p>
    <p class="title">El globo dice qué pasó en el lote</p>
    <ul class="glyphs">
      @for (item of glyphs; track item.type) {
        <li>
          <span class="mark"><app-event-glyph [type]="item.type" /></span>{{ item.label }}
        </li>
      }
    </ul>
    <p class="title">Su borde dice de dónde sale el dato</p>
    <ul class="origins">
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle class="verified" cx="12" cy="12" r="8" />
        </svg>
        Línea llena: verificado por satélite
      </li>
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle class="declared" cx="12" cy="12" r="9" />
          <circle class="declared" cx="12" cy="12" r="5.5" />
        </svg>
        Doble línea: declarado por el productor
      </li>
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle class="estimated" cx="12" cy="12" r="8" />
        </svg>
        Punteada: estimado (valor regional o por defecto)
      </li>
      <li>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle class="plain" cx="12" cy="12" r="6" />
          <circle class="simulated" cx="12" cy="12" r="10" />
        </svg>
        Contorno discontinuo: dato simulado para la demostración
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
      margin-top: var(--space-2);
      color: var(--ink);
      font-weight: 700;
    }
    ul {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(13rem, 100%), 1fr));
      gap: var(--space-2) var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .mark {
      --glyph-size: 1rem;
      display: grid;
      flex: none;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border: 1.5px solid var(--line-strong);
      border-radius: 50%;
      background: #fff;
      color: var(--ink-2);
    }
    svg {
      flex: none;
      width: 1.75rem;
      height: 1.75rem;
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
