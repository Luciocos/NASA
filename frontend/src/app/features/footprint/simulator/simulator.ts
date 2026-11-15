import { Component, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { Api } from '../../../core/api';
import { SimulationResult } from '../../../core/models';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import {
  CRITERION_STATUS,
  criterionLabel,
  formatKgPerTonne,
  formatNumber,
  plainError,
} from '../format';

/**
 * Simulador (CLAUDE.md, sección 11, pantalla 5): un control, cultivo de cobertura, y el
 * resultado antes y después en dos tarjetas (huella y puntaje) con los criterios que cambian.
 * La tabla de todos los criterios y las notas quedan plegadas. El backend no guarda nada.
 */
@Component({
  imports: [Disclosure, Icon, SectionCard],
  selector: 'app-simulator',
  styleUrl: './simulator.css',
  templateUrl: './simulator.html',
})
export class Simulator {
  private readonly api = inject(Api);

  readonly lotId = input.required<number>();
  /** nivel de los títulos: 2 como página; 3 adentro del popup del lote, debajo de su nombre */
  readonly level = input<2 | 3>(2);
  /** Id de la campaña para la huella; null usa la última del lote. */
  readonly campaign = input<number | null>(null);

  protected readonly coverCrop = signal(true);
  protected readonly result = signal<SimulationResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly status = CRITERION_STATUS;
  protected readonly formatKgPerTonne = formatKgPerTonne;
  protected readonly formatNumber = formatNumber;
  protected readonly criterionLabel = criterionLabel;

  protected run(): void {
    const campaign = this.campaign();
    this.loading.set(true);
    this.error.set(null);
    this.api
      .simulate(this.lotId(), {
        cover_crop: this.coverCrop(),
        ...(campaign === null ? {} : { campaign }),
      })
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(plainError(err.status, 'the simulation'));
          this.loading.set(false);
        },
      });
  }

  protected footprintText(value: number | null): string {
    return value === null ? 'Cannot be calculated yet' : formatKgPerTonne(value);
  }

  protected scoreLabel(score: number | null): string {
    return score === null ? 'No number' : `${formatNumber(score)} / 100`;
  }
}
