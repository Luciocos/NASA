import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { Api } from '../../../core/api';
import { Footprint, LotDetail, SustainabilityScore } from '../../../core/models';
import { DeclarationForm } from '../declaration-form/declaration-form';
import { FootprintBreakdown } from '../footprint-breakdown/footprint-breakdown';
import { ESTIMATE_NOTICE } from '../format';
import { ScorePanel } from '../score-panel/score-panel';
import { Simulator } from '../simulator/simulator';
import { LoginInvite } from '../../../shared/ui/login-invite/login-invite';
import { LotTabs } from '../../../shared/ui/lot-tabs/lot-tabs';

/** Huella estimada, puntaje provisional y simulador (CLAUDE.md, sección 11, pantallas 4 y 5). */
@Component({
  imports: [DeclarationForm, FootprintBreakdown, ScorePanel, Simulator, LotTabs, LoginInvite],
  selector: 'app-footprint-page',
  styleUrl: './footprint-page.css',
  templateUrl: './footprint-page.html',
})
export class FootprintPage {
  private readonly api = inject(Api);

  protected readonly lotId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => Number(params.get('lotId')))),
    { initialValue: NaN },
  );

  protected readonly notice = ESTIMATE_NOTICE;
  protected readonly lot = signal<LotDetail | null>(null);
  /** Id de la campaña elegida; null usa la última del lote. */
  protected readonly campaign = signal<number | null>(null);
  protected readonly footprint = signal<Footprint | null>(null);
  protected readonly score = signal<SustainabilityScore | null>(null);
  protected readonly error = signal<string | null>(null);
  /** El lote no existe o es de otra cuenta (404): se invita a ingresar. */
  protected readonly notFound = signal(false);

  constructor() {
    effect((onCleanup) => {
      const id = this.lotId();
      if (!Number.isInteger(id)) {
        this.error.set('El identificador del lote no es válido.');
        return;
      }
      this.error.set(null);
      this.notFound.set(false);
      const subscriptions = [
        this.api.lot(id).subscribe({
          next: (lot) => this.lot.set(lot),
          error: (error: { status?: number }) => {
            if (error.status === 404) this.notFound.set(true);
            else this.error.set('No se pudo cargar el lote. ¿Está corriendo el backend?');
          },
        }),
        this.api.score(id).subscribe({
          next: (score) => this.score.set(score),
          error: () => this.score.set(null),
        }),
      ];
      onCleanup(() => subscriptions.forEach((s) => s.unsubscribe()));
    });

    effect((onCleanup) => {
      const id = this.lotId();
      if (!Number.isInteger(id)) {
        return;
      }
      const subscription = this.api.footprint(id, this.campaign()).subscribe({
        next: (footprint) => this.footprint.set(footprint),
        error: () => this.footprint.set(null),
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  /** Tras declarar: muestra la huella recalculada y vuelve a pedir el puntaje. */
  protected onDeclared(footprint: Footprint): void {
    this.footprint.set(footprint);
    if (footprint.campaign?.id) this.campaign.set(footprint.campaign.id);
    this.api.score(this.lotId()).subscribe({ next: (score) => this.score.set(score) });
  }

  protected onCampaign(value: string): void {
    this.campaign.set(value === '' ? null : Number(value));
  }
}
