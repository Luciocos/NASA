import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { Icon } from '../../../shared/ui/icon/icon';
import { HELP_STEPS, helpStepIndex } from '../help-steps';
import { HelpScene } from '../help-scene/help-scene';

let nextId = 0;

/** lo mínimo que tiene que correrse el dedo de costado para pasar de paso, en px */
const SWIPE_MIN = 40;

/**
 * la guía de ayuda para cargar información: un paso por vez, cada uno con una miniatura de la
 * pantalla real (lo que hay que tocar, resaltado) y una frase de cinco o seis palabras
 *
 * se recorre con Anterior y Siguiente (44 px), con las flechas del teclado (también Inicio y
 * Fin) y deslizando con el dedo sobre la imagen. los puntos de abajo muestran el avance. en el
 * último paso, Siguiente pasa a ser Listo y avisa con `done`. cada cambio de paso se anuncia al
 * lector de pantalla ("Paso 3 de 9: …") y cada imagen lleva su descripción
 *
 * la usan el botón de ayuda (adentro de un diálogo, con título y Cerrar) y la página /ayuda
 *
 * @example
 * <app-help-guide heading="Cómo cargar tus datos" closable start="huella"
 *   (closed)="close()" (done)="close()" />
 * @example <app-help-guide labelledBy="ayuda-titulo" (done)="irAMiCampo()" />
 */
@Component({
  selector: 'app-help-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, HelpScene],
  templateUrl: './help-guide.html',
  styleUrl: './help-guide.css',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class HelpGuide {
  /** el paso en el que abre: su clave ('huella') o la pestaña del popup ('footprint') */
  readonly start = input<string | null | undefined>(null);
  /** título visible arriba de la guía (en el diálogo de ayuda). sin título no hay encabezado */
  readonly heading = input<string | null>(null);
  /** id del título visible, para que el diálogo lo use de nombre */
  readonly headingId = input(`help-guide-title-${++nextId}`);
  /** sin título propio: el id del título de la pantalla que la contiene */
  readonly labelledBy = input<string | null>(null);
  /** suma la X de cerrar al lado del título */
  readonly closable = input(false, { transform: booleanAttribute });
  /** tocaron Cerrar */
  readonly closed = output<void>();
  /** tocaron Listo en el último paso */
  readonly done = output<void>();

  protected readonly steps = HELP_STEPS;
  /** el paso a la vista; vuelve al de arranque si cambia `start` */
  protected readonly index = linkedSignal(() => helpStepIndex(this.start()));
  protected readonly step = computed(() => HELP_STEPS[this.index()]);
  /** una lista de un solo paso: al cambiar, la imagen se arma de nuevo y entra con movimiento */
  protected readonly shown = computed(() => [this.step()]);
  protected readonly isFirst = computed(() => this.index() === 0);
  protected readonly isLast = computed(() => this.index() === HELP_STEPS.length - 1);
  /** hacia dónde se avanzó: la imagen nueva entra desde ese lado */
  protected readonly direction = signal<1 | -1>(1);
  protected readonly label = computed(() =>
    this.heading() ? this.headingId() : (this.labelledBy() ?? null),
  );

  private readonly nextButton = viewChild.required<ElementRef<HTMLButtonElement>>('nextButton');
  /** dónde empezó el toque sobre la imagen, para reconocer un deslizamiento */
  private swipe: { x: number; y: number; id: number } | null = null;

  /** pone el foco en Siguiente (o Listo): lo usa el diálogo al abrirse */
  focusNext(): void {
    this.nextButton().nativeElement.focus({ preventScroll: true });
  }

  protected next(): void {
    this.goTo(this.index() + 1);
  }

  protected prev(): void {
    this.goTo(this.index() - 1);
  }

  /** Siguiente, o Listo en el último paso */
  protected advance(): void {
    if (this.isLast()) this.done.emit();
    else this.next();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target: Record<string, number> = {
      ArrowRight: this.index() + 1,
      ArrowLeft: this.index() - 1,
      Home: 0,
      End: HELP_STEPS.length - 1,
    };
    const index = target[event.key];
    if (index === undefined) return;
    event.preventDefault();
    this.goTo(index);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.isPrimary === false) return;
    this.swipe = { x: event.clientX, y: event.clientY, id: event.pointerId ?? 0 };
  }

  /** un deslizamiento de costado (más de lo que se movió en vertical) cambia de paso */
  protected onPointerUp(event: PointerEvent): void {
    const start = this.swipe;
    this.swipe = null;
    if (!start || start.id !== (event.pointerId ?? 0)) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) this.next();
    else this.prev();
  }

  protected onPointerCancel(): void {
    this.swipe = null;
  }

  private goTo(index: number): void {
    const clamped = Math.min(Math.max(index, 0), HELP_STEPS.length - 1);
    const current = this.index();
    if (clamped === current) return;
    this.direction.set(clamped > current ? 1 : -1);
    this.index.set(clamped);
  }
}
