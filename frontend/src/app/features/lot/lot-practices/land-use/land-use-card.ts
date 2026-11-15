import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  linkedSignal,
  model,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Api } from '../../../../core/api';
import { LandUseDeclaration, LotDetail } from '../../../../core/models';
import { DATA_SOURCES, LotSatellite, type LandUseYear } from '../../../../core/nasa';
import { OriginBadge } from '../../../../shared/origin-badge/origin-badge';
import { Icon } from '../../../../shared/ui/icon/icon';
import { SectionCard } from '../../../../shared/ui/section-card/section-card';
import { InfoTip } from '../../../../shared/ui/info-tip/info-tip';
import {
  differentYears,
  firstSentence,
  forLot,
  formatDay,
  landUseMatch,
  matchLine,
  modisChangeLine,
  modisStatus,
  noDataShort,
  pixelSize,
  pixelText,
  visibleYears,
  yearDetails,
  yearIcon,
  yearLabel,
} from './land-use';

let nextId = 0;

/**
 * uso del suelo desde 2020: lo que vio MODIS, una franja por año (VERIFIED, orientativo por
 * el tamaño del píxel), y, si el lote es del productor, lo que él declara (DECLARED) con la
 * comparación en una línea. a la vista, pocas palabras; el porqué, la fuente, los píxeles y la
 * clase IGBP de cada año, en las ayudas (i). en un ejemplo solo se ve lo de MODIS
 */
@Component({
  selector: 'app-land-use-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionCard, Icon, OriginBadge, InfoTip],
  templateUrl: './land-use-card.html',
  styleUrl: './land-use-card.css',
})
export class LandUseCard {
  private readonly api = inject(Api);
  private readonly satellite = inject(LotSatellite);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  readonly lot = input.required<LotDetail>();
  /** el dueño puede declarar; en un ejemplo nunca, aunque llegue en true */
  readonly editable = input(false, { transform: booleanAttribute });
  /** lo declarado. null: lo de la ficha (lot.land_use_declaration). al declarar se actualiza */
  readonly declaration = model<LandUseDeclaration | null>(null);

  protected readonly askId = `land-use-ask-${++nextId}`;
  protected readonly modisId = `land-use-modis-${nextId}`;

  protected readonly example = computed(() => this.lot().is_example === true);
  protected readonly mine = computed(() => this.lot().owned === true && !this.example());
  protected readonly canDeclare = computed(() => this.editable() && !this.example());
  protected readonly current = computed(() =>
    this.example() ? null : (this.declaration() ?? this.lot().land_use_declaration ?? null),
  );
  protected readonly declaredOn = computed(() => {
    const current = this.current();
    return current ? formatDay(current.declared_at) : '';
  });

  private readonly lotId = computed(() => this.lot().id);
  /** la opción que se está guardando (true: sin cambio), o null */
  protected readonly sending = linkedSignal<number, boolean | null>({
    source: this.lotId,
    computation: () => null,
  });
  /** la opción que no se pudo guardar, para reintentarla tal cual */
  protected readonly failed = linkedSignal<number, boolean | null>({
    source: this.lotId,
    computation: () => null,
  });
  /** con una declaración hecha, la persona tocó "Cambiar" */
  protected readonly changing = linkedSignal<number, boolean>({
    source: this.lotId,
    computation: () => false,
  });
  protected readonly announcement = linkedSignal<number, string>({
    source: this.lotId,
    computation: () => '',
  });
  protected readonly asking = computed(
    () => this.canDeclare() && (this.current() === null || this.changing()),
  );
  private readonly changeButton = viewChild<ElementRef<HTMLButtonElement>>('changeButton');
  private readonly firstOption = viewChild<ElementRef<HTMLButtonElement>>('firstOption');

  private readonly ref = computed(() => ({ id: this.lot().id, geometry: this.lot().geometry }));
  protected readonly modis = computed(() => this.satellite.landUse(this.ref())());
  protected readonly status = computed(() => modisStatus(this.modis()));
  protected readonly evidence = computed(() => this.modis().data);
  protected readonly years = computed(() => {
    const evidence = this.evidence();
    return evidence ? visibleYears(evidence) : [];
  });
  private readonly different = computed(() => {
    const evidence = this.evidence();
    return new Set(evidence ? differentYears(evidence) : []);
  });

  /** la comparación solo existe con una declaración, y no mientras se la cambia */
  protected readonly comparison = computed(() => {
    const match = landUseMatch(this.current()?.unchanged, this.status());
    if (match === null || this.changing()) return null;
    return matchLine(match, this.evidence(), this.modis().error);
  });
  /** sin comparación, solo se dice algo si MODIS vio un uso distinto */
  protected readonly changeLine = computed(() => {
    const evidence = this.evidence();
    return this.comparison() || !evidence ? null : modisChangeLine(evidence, this.mine());
  });
  protected readonly noData = computed(() => {
    const evidence = this.evidence();
    return evidence?.verdict === 'no_data' ? noDataShort(evidence) : '';
  });
  /** MODIS vio algo en algún año: recién ahí lleva su origen (VERIFICADO) */
  protected readonly hasData = computed(() => this.years().some((year) => year.pixels > 0));
  protected readonly errorShort = computed(
    () => firstSentence(this.modis().error) || 'No se pudo consultar a MODIS',
  );

  protected readonly retrievedOn = computed(() => {
    const evidence = this.evidence();
    return evidence ? formatDay(evidence.source.retrievedAt) : '';
  });
  /** "Orientativo · píxeles de 460 m", y si es una copia vieja, de cuándo */
  protected readonly note = computed(() => {
    const base = `Orientativo · píxeles de ${pixelSize(this.evidence())} m`;
    return this.modis().stale && this.retrievedOn()
      ? `${base} · copia del ${this.retrievedOn()}`
      : base;
  });

  /** lo de la ayuda de MODIS: el motivo completo, los píxeles, cada año y la fuente */
  protected readonly reason = computed(() => forLot(this.evidence()?.reason ?? '', this.mine()));
  protected readonly pixels = computed(() => {
    const evidence = this.evidence();
    return evidence ? pixelText(evidence, this.mine()) : '';
  });
  /** la fuente con la fecha de la consulta, o la ficha fija de la fuente mientras no hay dato */
  protected readonly source = computed(() => this.evidence()?.source ?? DATA_SOURCES.modisLandUse);
  protected readonly sourceNote = computed(() => forLot(this.source().note, this.mine()));
  protected readonly sourceText = computed(() => {
    const source = this.source();
    const parts = [
      `Fuente: ${source.name}.`,
      `${source.product}.`,
      `Resolución: ${source.resolution}.`,
      `Frecuencia: ${source.cadence}.`,
    ];
    const day = this.retrievedOn();
    if (day) {
      const stale = this.modis().stale ? ', copia guardada sin poder actualizarla' : '';
      parts.push(`Consultado el ${day}${stale}.`);
    }
    return parts.join(' ');
  });

  protected readonly yearLines = computed(() => yearDetails(this.years()));

  protected readonly skeletonCells = [0, 1, 2, 3, 4];
  protected readonly yearLabel = yearLabel;
  protected readonly yearIcon = yearIcon;

  protected isDifferent(year: LandUseYear): boolean {
    return this.different().has(year.year);
  }

  protected declare(unchanged: boolean): void {
    if (this.sending() !== null) return;
    const lotId = this.lot().id;
    this.sending.set(unchanged);
    this.failed.set(null);
    this.announcement.set('');
    this.api
      .declareLandUse(lotId, unchanged)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (declaration) => {
          if (this.lot().id !== lotId) return;
          this.sending.set(null);
          this.changing.set(false);
          this.declaration.set(declaration);
          this.announcement.set(
            `Guardamos tu declaración del ${formatDay(declaration.declared_at)}.`,
          );
          this.focus(this.changeButton);
        },
        error: () => {
          if (this.lot().id !== lotId) return;
          this.sending.set(null);
          this.failed.set(unchanged);
        },
      });
  }

  protected retryDeclare(): void {
    const value = this.failed();
    if (value !== null) this.declare(value);
  }

  protected startChange(): void {
    this.changing.set(true);
    this.failed.set(null);
    this.announcement.set('');
    this.focus(this.firstOption);
  }

  protected cancelChange(): void {
    this.changing.set(false);
    this.failed.set(null);
    this.focus(this.changeButton);
  }

  protected retryModis(): void {
    this.satellite.retry(this.ref());
  }

  /** el botón que se toca desaparece: el foco pasa al que queda en su lugar, así no se pierde */
  private focus(target: () => ElementRef<HTMLButtonElement> | undefined): void {
    afterNextRender(() => target()?.nativeElement.focus(), { injector: this.injector });
  }
}
