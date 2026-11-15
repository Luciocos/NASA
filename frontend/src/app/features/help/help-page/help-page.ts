import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { HelpGuide } from '../help-guide/help-guide';

/**
 * /ayuda (pública): la misma guía del botón de ayuda como página, para mostrarla en una
 * presentación o mandarla por enlace. ?paso=huella abre en ese paso. Listo lleva a Mi campo, o
 * a crear la cuenta si no hay sesión
 */
@Component({
  selector: 'app-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, HelpGuide],
  template: `
    <app-page-header
      heading="How to enter your data"
      subtitle="What to tap on each screen, step by step."
      headingId="ayuda-titulo"
    />
    <div class="card guide-card">
      <app-help-guide labelledBy="ayuda-titulo" [start]="start" (done)="finish()" />
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-5);
      width: 100%;
      max-width: 46rem;
      margin-inline: auto;
    }
    .guide-card {
      padding: var(--space-5);
    }
    @media (max-width: 40rem) {
      :host {
        gap: var(--space-4);
      }
      .guide-card {
        padding: var(--space-4) var(--space-3);
      }
    }
  `,
})
export class HelpPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** el paso de la dirección (?paso=huella), para compartir uno en particular */
  protected readonly start = inject(ActivatedRoute).snapshot.queryParamMap.get('paso');

  protected finish(): void {
    void this.router.navigateByUrl(this.auth.loggedIn() ? '/mapa' : '/registrarse');
  }
}
