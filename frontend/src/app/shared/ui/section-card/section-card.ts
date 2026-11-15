import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
  numberAttribute,
} from '@angular/core';

let nextId = 0;

/**
 * tarjeta de sección: título, subtítulo opcional, acciones a la derecha del título y el cuerpo
 *
 * lo proyectado con el atributo `actions` va al encabezado (un control segmentado, un botón
 * chico o un app-more-menu); lo proyectado con `footer` va al pie, separado por una línea (un
 * app-disclosure "Ver detalle", una fuente); el resto es el cuerpo. con `flush` el cuerpo no
 * tiene relleno, para un mapa o una maqueta que llegan hasta el borde de la tarjeta
 *
 * @example
 * <app-section-card heading="Bitácora" subtitle="Lo que detectaron los satélites, por fecha.">
 *   <a actions class="btn btn--sm" routerLink="huella">Ver huella</a>
 *   <ol>...</ol>
 *   <app-disclosure footer label="Cómo se detecta cada evento" flat>...</app-disclosure>
 * </app-section-card>
 */
@Component({
  selector: 'app-section-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-flush]': 'flush()' },
  template: `
    <header class="head">
      <div class="titles">
        @if (level() === 3) {
          <h3 class="title" [id]="headingId">{{ heading() }}</h3>
        } @else {
          <h2 class="title" [id]="headingId">{{ heading() }}</h2>
        }
        @if (subtitle(); as subtitleText) {
          <p class="subtitle">{{ subtitleText }}</p>
        }
      </div>
      <div class="actions"><ng-content select="[actions]" /></div>
    </header>
    <div class="body"><ng-content /></div>
    <div class="foot"><ng-content select="[footer]" /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-1);
    }
    :host(.is-flush) {
      overflow: clip;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3) var(--space-4);
      padding: var(--space-4) var(--space-5);
    }
    .titles {
      display: grid;
      flex: 1 1 14rem;
      gap: 0.125rem;
      min-width: 0;
    }
    .title {
      margin: 0;
      font-size: var(--text-lg);
    }
    .subtitle {
      margin: 0;
      color: var(--ink-3);
      font-size: var(--text-sm);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .actions:empty {
      display: none;
    }
    .body {
      flex: 1;
      min-width: 0;
      padding: 0 var(--space-5) var(--space-5);
    }
    :host(.is-flush) .body {
      padding: 0;
    }
    .foot {
      padding: var(--space-1) var(--space-5);
      border-top: 1px solid var(--line);
    }
    .foot:empty {
      display: none;
    }
    @media (max-width: 40rem) {
      .head {
        padding: var(--space-3) var(--space-4);
      }
      .body {
        padding: 0 var(--space-4) var(--space-4);
      }
      .foot {
        padding-inline: var(--space-4);
      }
    }
  `,
})
export class SectionCard {
  /** título de la sección */
  readonly heading = input.required<string>();
  /** una línea debajo del título */
  readonly subtitle = input<string | null>(null);
  /** nivel del título: h2 por defecto, h3 para una tarjeta dentro de otra sección */
  readonly level = input(2, { transform: numberAttribute });
  /** cuerpo sin relleno, hasta el borde de la tarjeta */
  readonly flush = input(false, { transform: booleanAttribute });

  /** id del título, para que el contenido lo use en aria-labelledby */
  readonly headingId = `section-card-${nextId++}`;
}
