import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HELP_STEPS } from '../help-steps';
import { HelpGuide } from './help-guide';

@Component({
  imports: [HelpGuide],
  template: `
    <app-help-guide
      [start]="start()"
      [heading]="heading()"
      [closable]="closable()"
      (done)="done = done + 1"
      (closed)="closed = closed + 1"
    />
  `,
})
class Host {
  readonly start = signal<string | null>(null);
  readonly heading = signal<string | null>(null);
  readonly closable = signal(false);
  done = 0;
  closed = 0;
}

describe('HelpGuide', () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;
  const guide = () => el().querySelector<HTMLElement>('app-help-guide')!;
  const figure = () => el().querySelector<HTMLElement>('figure')!;
  const step = () => figure().getAttribute('data-step');
  const image = () => figure().querySelector<SVGElement>('svg')!;
  const caption = () => figure().querySelector('.caption__text')!.textContent!.trim();
  const number = () => figure().querySelector('.num')!.textContent!.trim();
  const live = () => el().querySelector('[aria-live]')!.textContent!.replace(/\s+/g, ' ').trim();
  const prev = () => el().querySelector<HTMLButtonElement>('button.prev')!;
  const next = () => el().querySelector<HTMLButtonElement>('button.next')!;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function click(button: HTMLElement): Promise<void> {
    button.click();
    await render();
  }

  async function key(name: string, target: HTMLElement = next()): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    await render();
    return event;
  }

  async function swipe(dx: number, dy = 0): Promise<void> {
    const stage = el().querySelector<HTMLElement>('.stage')!;
    const at = (type: string, x: number, y: number) =>
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        isPrimary: true,
        bubbles: true,
      });
    stage.dispatchEvent(at('pointerdown', 200, 100));
    stage.dispatchEvent(at('pointerup', 200 + dx, 100 + dy));
    await render();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await render();
  });

  it('arranca en el primer paso: imagen con su descripción, frase corta y "Paso 1 de 9"', () => {
    expect(step()).toBe('marcar');
    expect(image().getAttribute('role')).toBe('img');
    expect(image().getAttribute('aria-label')).toBe(HELP_STEPS[0].description);
    expect(caption()).toBe(HELP_STEPS[0].caption);
    expect(number()).toBe('1');
    expect(live()).toBe(`Step 1 of 9: ${HELP_STEPS[0].caption}`);
  });

  it('cada paso muestra su imagen con role="img" y un nombre que la describe', async () => {
    for (const [index, item] of HELP_STEPS.entries()) {
      expect(step()).toBe(item.key);
      expect(image().getAttribute('role')).toBe('img');
      expect(image().getAttribute('aria-label')).toBe(item.description);
      expect(caption()).toBe(item.caption);
      expect(number()).toBe(String(index + 1));
      expect(live()).toBe(`Step ${index + 1} of 9: ${item.caption}`);
      if (index < HELP_STEPS.length - 1) await click(next());
    }
  });

  it('Siguiente y Anterior recorren los pasos; en el primero, Anterior no hace nada', async () => {
    expect(prev().getAttribute('aria-disabled')).toBe('true');
    await click(prev());
    expect(step()).toBe('marcar');

    await click(next());
    expect(step()).toBe('abrir');
    expect(prev().getAttribute('aria-disabled')).toBeNull();
    await click(next());
    expect(step()).toBe('satelite');
    await click(prev());
    expect(step()).toBe('abrir');
  });

  it('Anterior conserva su nombre aunque en el celular quede solo la flecha', () => {
    expect(prev().textContent!.trim()).toBe('Back');
    expect(next().textContent!.trim()).toBe('Next');
  });

  it('en el último paso, Siguiente pasa a ser Listo y avisa con done', async () => {
    fixture.componentInstance.start.set('pasaporte');
    await render();
    expect(step()).toBe('pasaporte');
    expect(next().textContent!.trim()).toBe('Done');
    await click(next());
    expect(fixture.componentInstance.done).toBe(1);
    expect(step()).toBe('pasaporte');
  });

  it('abre en el paso pedido, por su clave o por la pestaña del popup', async () => {
    fixture.componentInstance.start.set('huella');
    await render();
    expect(step()).toBe('huella');
    expect(live()).toBe('Step 6 of 9: Enter yield and inputs');

    fixture.componentInstance.start.set('log');
    await render();
    expect(step()).toBe('bitacora');
  });

  it('las flechas del teclado, Inicio y Fin cambian de paso', async () => {
    let event = await key('ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(step()).toBe('abrir');
    await key('ArrowRight', prev());
    expect(step()).toBe('satelite');
    await key('ArrowLeft');
    expect(step()).toBe('abrir');
    await key('End');
    expect(step()).toBe('pasaporte');
    // en el último, la flecha no sigue de largo ni cierra
    await key('ArrowRight');
    expect(step()).toBe('pasaporte');
    expect(fixture.componentInstance.done).toBe(0);
    await key('Home');
    expect(step()).toBe('marcar');
    // otra tecla no se toca
    event = await key('Enter');
    expect(event.defaultPrevented).toBe(false);
  });

  it('deslizar con el dedo de costado cambia de paso; en vertical, no', async () => {
    await swipe(-90);
    expect(step()).toBe('abrir');
    await swipe(-90);
    expect(step()).toBe('satelite');
    await swipe(90);
    expect(step()).toBe('abrir');
    // un toque o un desplazamiento vertical no cuentan
    await swipe(-10);
    await swipe(-50, 120);
    expect(step()).toBe('abrir');
  });

  it('los puntos marcan el avance y no se leen', async () => {
    const dots = () => [...el().querySelectorAll<HTMLElement>('.dot')];
    expect(dots().length).toBe(9);
    expect(el().querySelector('.dots')!.getAttribute('aria-hidden')).toBe('true');
    await click(next());
    await click(next());
    expect(dots().map((dot) => dot.className.includes('is-current'))).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(dots().filter((dot) => dot.classList.contains('is-done')).length).toBe(2);
  });

  it('con título y cerrar: la guía se nombra por su título y la X avisa con closed', async () => {
    expect(el().querySelector('h2')).toBeNull();
    expect(guide().querySelector('section')!.getAttribute('aria-label')).toBe(
      'How to enter your data',
    );

    fixture.componentInstance.heading.set('How to enter your data');
    fixture.componentInstance.closable.set(true);
    await render();
    const title = el().querySelector('h2')!;
    expect(title.textContent!.trim()).toBe('How to enter your data');
    expect(guide().querySelector('section')!.getAttribute('aria-labelledby')).toBe(title.id);

    const close = [...el().querySelectorAll('button')].find(
      (button) => button.textContent!.trim() === 'Close help',
    )!;
    await click(close);
    expect(fixture.componentInstance.closed).toBe(1);
  });

  it('en las imágenes no hay números que parezcan datos', async () => {
    for (let index = 0; index < HELP_STEPS.length; index++) {
      const texts = [...image().querySelectorAll('text')].map((text) => text.textContent ?? '');
      for (const text of texts) expect(text).not.toMatch(/\d/);
      if (index < HELP_STEPS.length - 1) await click(next());
    }
  });
});
