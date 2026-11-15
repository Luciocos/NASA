import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Api } from '../../../core/api';
import { CriterionStatus, LotDetail, SustainabilityScore } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { PracticeLinkKind, STATUS_ICONS, pickRecommendations, statusLabel } from './practices';

type ScoreState =
  | { status: 'loading'; lot: number; data: null }
  | { status: 'error'; lot: number; data: null }
  | { status: 'ready'; lot: number; data: SustainabilityScore };

/**
 * buenas prácticas del lote a partir de los criterios del puntaje (GET /api/lots/{id}/score/):
 * hasta tres recomendaciones destacadas (primero lo que no cumple, después lo que falta medir)
 * y el estado de cada práctica con ícono y texto. el puntaje es provisional y se dice; cómo se
 * calcula queda plegado
 */
@Component({
  selector: 'app-lot-practices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SectionCard, Disclosure, Icon, OriginBadge, SimulatedNotice],
  templateUrl: './lot-practices.html',
  styleUrl: './lot-practices.css',
})
export class LotPractices {
  private readonly api = inject(Api);

  readonly lot = input.required<LotDetail>();
  /** sube cada vez que se confirma o corrige un evento: el puntaje se vuelve a pedir */
  readonly refresh = input(0);

  private readonly attempt = signal(0);
  protected readonly state = signal<ScoreState>({ status: 'loading', lot: NaN, data: null });
  protected readonly score = computed(() => this.state().data);

  /** solo el dueño puede confirmar eventos: en un ejemplo no se lo invita a hacerlo */
  protected readonly editable = computed(
    () => this.lot().owned === true && this.lot().is_example !== true,
  );
  protected readonly heading = computed(() =>
    this.editable() ? 'Buenas prácticas para tu lote' : 'Buenas prácticas para este lote',
  );
  /** sin ningún dato todavía (un lote nuevo) se explica qué va a pasar, sin culpar a nadie */
  protected readonly empty = computed(() => {
    const criteria = this.score()?.criteria ?? [];
    return criteria.length > 0 && criteria.every((criterion) => criterion.status === 'sin_dato');
  });
  protected readonly subtitle = computed(() => {
    if (!this.empty()) return 'Lo que muestra la bitácora sobre las prácticas que cuidan el suelo.';
    return this.editable()
      ? 'Todavía no hay datos: el satélite va a ir registrando las labores en la bitácora y vas a poder confirmarlas.'
      : 'Todavía no hay datos: el satélite va a ir registrando las labores en la bitácora.';
  });

  protected readonly recommendations = computed(() =>
    pickRecommendations(this.score()?.criteria ?? []),
  );
  protected readonly simulated = computed(() => {
    const score = this.score();
    return (
      !!score &&
      (score.uses_simulated_data ||
        score.criteria.some(
          (criterion) =>
            criterion.is_simulated || criterion.evidence.some((item) => item.is_simulated),
        ))
    );
  });
  protected readonly scoreText = computed(() => {
    const score = this.score();
    if (!score) return '';
    if (score.score !== null) return `Puntaje provisional: ${score.score} de ${score.max_score}`;
    if (!score.weights_defined) return 'Puntaje provisional: todavía sin pesos definidos';
    const missing = score.missing_criteria.length;
    if (missing > 0) {
      return `Puntaje provisional: sin calcular, faltan datos de ${missing} ${missing === 1 ? 'práctica' : 'prácticas'}`;
    }
    return 'Puntaje provisional: sin dato';
  });
  protected readonly confidenceLabel = computed(() => {
    const level = this.score()?.confidence.level ?? '';
    return level ? level.charAt(0) + level.slice(1).toLowerCase() : 'Sin dato';
  });

  protected readonly statusIcons = STATUS_ICONS;
  protected readonly statusLabel = statusLabel;

  constructor() {
    effect((onCleanup) => {
      const id = this.lot().id;
      this.refresh();
      this.attempt();
      // al volver a pedir el mismo lote se deja lo que ya se ve hasta que llegue lo nuevo
      untracked(() => {
        const current = this.state();
        if (current.lot !== id || current.status !== 'ready') {
          this.state.set({ status: 'loading', lot: id, data: null });
        }
      });
      const subscription = this.api.score(id).subscribe({
        next: (data) => this.state.set({ status: 'ready', lot: id, data }),
        error: () => this.state.set({ status: 'error', lot: id, data: null }),
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected retry(): void {
    this.attempt.update((value) => value + 1);
  }

  protected route(kind: PracticeLinkKind): (string | number)[] {
    const id = this.lot().id;
    if (kind === 'footprint') return ['/huella', id];
    if (kind === 'fertilization') return ['/lotes', id, 'fertilizacion'];
    return ['/lotes', id];
  }

  protected tone(status: CriterionStatus): string {
    return status === 'cumple' ? 'chip--ok' : status === 'no_cumple' ? 'chip--warn' : '';
  }

  protected weightText(weight: number | null, max: number): string {
    return weight === null ? 'peso sin definir' : `vale ${weight} de ${max} puntos`;
  }
}
