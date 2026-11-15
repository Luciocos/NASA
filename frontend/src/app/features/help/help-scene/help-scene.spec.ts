import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HELP_STEPS, HelpStepKey } from '../help-steps';
import { HelpScene } from './help-scene';

/** el dibujo mide 260 × 176; la mano ocupa 13 a la derecha de la punta del dedo y 24 abajo */
const WIDTH = 260;
const HEIGHT = 176;
const HAND_RIGHT = 13;
const HAND_DOWN = 24;

describe('HelpScene', () => {
  let fixture: ComponentFixture<HelpScene>;
  const svg = () => (fixture.nativeElement as HTMLElement).querySelector('svg')!;

  async function render(step: HelpStepKey): Promise<void> {
    fixture.componentRef.setInput('step', step);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /** dónde queda la punta del dedo al final: la de una secuencia o la de un toque quieto */
  function restingPoint(): [number, number] | null {
    const hand = svg().querySelector<SVGGElement>('g.hand')!;
    const last = hand.classList.contains('seq3') ? 3 : 2;
    const x = hand.style.getPropertyValue(`--x${last}`);
    if (x) return [parseFloat(x), parseFloat(hand.style.getPropertyValue(`--y${last}`))];
    const tap = /translate\(([\d.]+) ([\d.]+)\)/.exec(hand.getAttribute('transform') ?? '');
    return tap ? [Number(tap[1]), Number(tap[2])] : null;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HelpScene] }).compileComponents();
    fixture = TestBed.createComponent(HelpScene);
  });

  it('la mano termina entera adentro del dibujo en cada paso', async () => {
    for (const { key } of HELP_STEPS) {
      await render(key);
      const point = restingPoint();
      // Marcar lote y el pasaporte se mueven desde la hoja de estilos
      if (!point) continue;
      const [x, y] = point;
      expect(x + HAND_RIGHT, key).toBeLessThanOrEqual(WIDTH);
      expect(y + HAND_DOWN, key).toBeLessThanOrEqual(HEIGHT);
    }
  });

  it('en la bitácora el evento abierto es estimado: Confirmar solo se ofrece en uno estimado', async () => {
    await render('bitacora');
    expect(svg().querySelector('.badge-v')).toBeNull();
    expect(svg().querySelectorAll('.badge-e').length).toBeGreaterThan(0);
  });

  it('en el uso del suelo la mano no queda arriba de ninguna de las dos respuestas', async () => {
    await render('practicas');
    const [x] = restingPoint()!;
    const answers = [...svg().querySelectorAll('rect.input')];
    expect(answers.length).toBe(2);
    for (const answer of answers) {
      const right = Number(answer.getAttribute('x')) + Number(answer.getAttribute('width'));
      expect(x).toBeGreaterThan(right);
    }
  });
});
