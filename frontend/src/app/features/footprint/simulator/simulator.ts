import { Component, inject, input, signal } from '@angular/core';

import { Api } from '../../../core/api';
import { SimulationResult } from '../../../core/models';
import { CRITERION_STATUS, formatKgPerTonne, formatNumber } from '../format';

/**
 * Simulador (CLAUDE.md, sección 11, pantalla 5): un control, cultivo de cobertura,
 * y el resultado antes y después. El backend no guarda nada.
 */
@Component({
  imports: [],
  selector: 'app-simulator',
  styleUrl: './simulator.css',
  templateUrl: './simulator.html',
})
export class Simulator {
  private readonly api = inject(Api);

  readonly lotId = input.required<number>();
  /** Id de la campaña para la huella; null usa la última del lote. */
  readonly campaign = input<number | null>(null);

  protected readonly coverCrop = signal(true);
  protected readonly result = signal<SimulationResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly status = CRITERION_STATUS;
  protected readonly formatKgPerTonne = formatKgPerTonne;
  protected readonly formatNumber = formatNumber;

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
        error: () => {
          this.error.set('No se pudo correr la simulación.');
          this.loading.set(false);
        },
      });
  }

  protected scoreLabel(score: number | null): string {
    return score === null ? 'Sin número' : `${formatNumber(score)} / 100`;
  }
}
