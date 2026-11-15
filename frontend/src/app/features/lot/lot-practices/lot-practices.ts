import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';

import { Api } from '../../../core/api';
import {
  CriterionStatus,
  EventType,
  LandUseDeclaration,
  LotDetail,
  Origin,
  SustainabilityScore,
} from '../../../core/models';
import { LotSatellite } from '../../../core/nasa';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
import { SimulatedNotice } from '../../../shared/simulated-notice/simulated-notice';
import { Disclosure } from '../../../shared/ui/disclosure/disclosure';
import { Icon } from '../../../shared/ui/icon/icon';
import { SectionCard } from '../../../shared/ui/section-card/section-card';
import { EVENT_TYPE_LABELS, formatDate } from '../labels';
import { PracticeTip } from './practice-tip/practice-tip';
import { LandUseCard } from './land-use/land-use-card';
import { TerritorialChecks } from '../../territory/territorial-checks/territorial-checks';
import { LAND_USE_KEY, formatDay, landUseMatch, modisStatus } from './land-use/land-use';
import {
  STATUS_ICONS,
  STATUS_TONES,
  StatusTone,
  pickRecommendations,
  practiceRows,
  statusLabel,
} from './practices';
import { Slides } from './slides/slides';

type ScoreState =
  | { status: 'loading'; lot: number; data: null }
  | { status: 'error'; lot: number; data: null }
  | { status: 'ready'; lot: number; data: SustainabilityScore };

let nextId = 0;

const SCORE_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const CONFIDENCE_TEXT: Record<string, string> = {
  ALTO: 'alta',
  BAJO: 'baja',
  'SIN DATOS': 'sin datos',
};
const CHIP_CLASSES: Record<StatusTone, string> = {
  ok: 'chip--ok',
  warn: 'chip--warn',
  neutral: '',
};

/**
 * la pestaña Prácticas del lote, para leer de un vistazo: el puntaje provisional
 * (GET /api/lots/{id}/score/), hasta tres recomendaciones de una frase (deslizables si no
 * entran), cada práctica con su estado en un chip y la tarjeta de uso del suelo desde 2020 (lo
 * declarado frente a lo que vio MODIS). los porqués van en ayudas (i) y cómo se calcula el
 * puntaje (pesos, motivos, confianza, aviso provisional y evidencia), plegado
 *
 * sirve igual en el popup del lote y en su ruta (/lotes/:id/practicas). lo que se escribe
 * (declarar el uso del suelo) es solo del dueño: `editable`, y nunca en un ejemplo
 */
@Component({
  selector: 'app-lot-practices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SectionCard,
    Disclosure,
    Icon,
    OriginBadge,
    SimulatedNotice,
    PracticeTip,
    LandUseCard,
    TerritorialChecks,
    Slides,
  ],
  templateUrl: './lot-practices.html',
  styleUrl: './lot-practices.css',
})
export class LotPractices {
  private readonly api = inject(Api);
  private readonly satellite = inject(LotSatellite);

  readonly lot = input.required<LotDetail>();
  /** sube cada vez que se confirma o corrige un evento: el puntaje se vuelve a pedir */
  readonly refresh = input(0);
  /** el dueño puede declarar el uso del suelo; en un ejemplo nunca, aunque llegue en true */
  readonly editable = input(false, { transform: booleanAttribute });

  private readonly attempt = signal(0);
  protected readonly state = signal<ScoreState>({ status: 'loading', lot: NaN, data: null });
  protected readonly score = computed(() => this.state().data);

  protected readonly canEdit = computed(() => this.editable() && this.lot().is_example !== true);

  /** lo declarado sobre el uso del suelo: el de la ficha, o el que se acaba de guardar */
  protected readonly declaration = linkedSignal<LandUseDeclaration | null>(() =>
    this.lot().is_example === true ? null : (this.lot().land_use_declaration ?? null),
  );
  private readonly ref = computed(() => ({ id: this.lot().id, geometry: this.lot().geometry }));
  /** lo declarado frente a MODIS: solo se consulta si hay una declaración que comparar */
  private readonly match = computed(() => {
    const declaration = this.declaration();
    if (!declaration) return null;
    return landUseMatch(declaration.unchanged, modisStatus(this.satellite.landUse(this.ref())()));
  });
  private readonly skip = computed(() => (this.declaration() ? [LAND_USE_KEY] : []));

  protected readonly rows = computed(() =>
    practiceRows(this.score()?.criteria ?? [], this.declaration(), this.match()),
  );
  /** sin labores en la bitácora todavía (un lote nuevo): se dice en una línea, sin culpar */
  protected readonly empty = computed(() => {
    const criteria = (this.score()?.criteria ?? []).filter(
      (criterion) => !this.skip().includes(criterion.key),
    );
    return criteria.length > 0 && criteria.every((criterion) => criterion.status === 'sin_dato');
  });
  protected readonly subtitle = computed(() =>
    this.empty() ? 'Todavía no hay labores en la bitácora.' : 'Según la bitácora del lote.',
  );

  protected readonly recommendations = computed(() =>
    pickRecommendations(this.score()?.criteria ?? [], 3, this.skip()),
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
  /** el número, o por qué no hay número */
  protected readonly scoreValue = computed(() => {
    const score = this.score();
    return score?.score === null || score?.score === undefined
      ? null
      : SCORE_FORMAT.format(score.score);
  });
  protected readonly scoreHint = computed(() => {
    const score = this.score();
    if (!score || score.score !== null) return '';
    if (!score.weights_defined) return 'Todavía sin pesos definidos';
    const missing = score.missing_criteria.length;
    if (missing > 0)
      return `Faltan datos de ${missing} ${missing === 1 ? 'práctica' : 'prácticas'}`;
    return 'Sin dato';
  });
  protected readonly confidenceText = computed(
    () => CONFIDENCE_TEXT[this.score()?.confidence.level ?? ''] ?? 'sin dato',
  );
  protected readonly declaredOn = computed(() => {
    const declaration = this.declaration();
    return declaration ? formatDay(declaration.declared_at) : '';
  });

  protected readonly recsId = `practice-recs-${++nextId}`;
  protected readonly listId = `practice-list-${nextId}`;
  protected readonly landUseKey = LAND_USE_KEY;
  protected readonly origins: Origin[] = ['VERIFIED', 'DECLARED', 'ESTIMATED'];
  protected readonly statusIcons = STATUS_ICONS;
  protected readonly statusLabel = statusLabel;
  protected readonly formatDate = formatDate;

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

  protected chip(tone: StatusTone): string {
    return CHIP_CLASSES[tone];
  }

  protected tone(status: CriterionStatus): string {
    return CHIP_CLASSES[STATUS_TONES[status]];
  }

  protected weightText(weight: number | null, max: number): string {
    return weight === null
      ? 'peso sin definir'
      : `vale ${SCORE_FORMAT.format(weight)} de ${max} puntos`;
  }

  protected eventLabel(type: EventType): string {
    return EVENT_TYPE_LABELS[type] ?? type;
  }
}
