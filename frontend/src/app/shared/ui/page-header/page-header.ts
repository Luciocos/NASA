import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * encabezado de una pantalla: kicker opcional, título (h1), subtítulo de una línea y las
 * acciones a la derecha. en el celular las acciones bajan debajo del texto y se reparten el
 * ancho
 *
 * lo proyectado con el atributo `actions` va a la derecha. el resto del contenido proyectado
 * va debajo del subtítulo (chips de estado, app-origin-badge, app-simulated-notice)
 *
 * el título es el input `heading` y no `title`: un atributo title en el host mostraría
 * además un tooltip del navegador
 *
 * @example
 * <app-page-header kicker="Cuenta demo" heading="Mi campo"
 *   subtitle="Cómo están tus lotes según lo que ven los satélites.">
 *   <a actions class="btn btn--primary" routerLink="/mapa/nuevo">Marcar lote</a>
 * </app-page-header>
 */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="text">
      @if (kicker(); as kickerText) {
        <p class="kicker">{{ kickerText }}</p>
      }
      <h1 [attr.id]="headingId()">{{ heading() }}</h1>
      @if (subtitle(); as subtitleText) {
        <p class="subtitle">{{ subtitleText }}</p>
      }
      <ng-content />
    </div>
    <div class="actions"><ng-content select="[actions]" /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-4) var(--space-6);
    }
    .text {
      display: grid;
      flex: 1 1 24rem;
      gap: var(--space-1);
      min-width: 0;
    }
    .kicker {
      margin: 0;
      color: var(--ink-3);
      font-size: var(--text-sm);
      font-weight: 600;
    }
    h1 {
      margin: 0;
    }
    .subtitle {
      max-width: 46rem;
      margin: 0;
      color: var(--ink-2);
      font-size: var(--text-lg);
      line-height: 1.4;
    }
    /* grid: lo proyectado se estira al ancho de su columna sin tocar sus estilos */
    .actions {
      display: grid;
      grid-auto-columns: auto;
      grid-auto-flow: column;
      align-items: center;
      gap: var(--space-2);
    }
    .actions:empty {
      display: none;
    }
    @media (max-width: 40rem) {
      :host {
        gap: var(--space-4);
      }
      .subtitle {
        font-size: var(--text-md);
      }
      .actions {
        grid-auto-columns: minmax(0, 1fr);
        width: 100%;
      }
    }
  `,
})
export class PageHeader {
  /** título de la pantalla, en un h1 */
  readonly heading = input.required<string>();
  /** línea chica arriba del título, por ejemplo la cuenta o el lote */
  readonly kicker = input<string | null>(null);
  /** una sola línea con lo que responde la pantalla */
  readonly subtitle = input<string | null>(null);
  /** id del h1, para aria-labelledby de la pantalla */
  readonly headingId = input<string | null>(null);
}
