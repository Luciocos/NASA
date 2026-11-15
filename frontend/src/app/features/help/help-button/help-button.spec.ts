import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HelpButton } from './help-button';

@Component({
  imports: [HelpButton],
  template: `<app-help-button [step]="step()" />`,
})
class Host {
  readonly step = signal<string | null>(null);
}

describe('HelpButton', () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;
  const trigger = () => el().querySelector<HTMLButtonElement>('button.trigger')!;
  const dialog = () => el().querySelector<HTMLDialogElement>('dialog')!;
  const isOpen = () => dialog().hasAttribute('open');
  const step = () => dialog().querySelector('figure')?.getAttribute('data-step') ?? null;
  const next = () => dialog().querySelector<HTMLButtonElement>('button.next')!;
  const root = () => document.documentElement;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function open(): Promise<void> {
    trigger().click();
    await render();
  }

  async function press(key: string, target: HTMLElement = next()): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    await render();
    return event;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await render();
  });

  afterEach(() => {
    root().style.removeProperty('overflow');
    root().style.removeProperty('scrollbar-gutter');
  });

  it('es un botón con nombre que anuncia un diálogo, cerrado al principio', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Help: how to enter your data');
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-controls')).toBe(dialog().id);
    expect(isOpen()).toBe(false);
    // la guía se arma recién al abrir
    expect(dialog().querySelector('app-help-guide')).toBeNull();
  });

  it('abre la guía en un diálogo con título, en el primer paso y con el foco en Siguiente', async () => {
    await open();
    expect(isOpen()).toBe(true);
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const title = dialog().querySelector('h2')!;
    expect(title.textContent!.trim()).toBe('How to enter your data');
    expect(dialog().getAttribute('aria-labelledby')).toBe(title.id);
    expect(step()).toBe('marcar');
    expect(document.activeElement).toBe(next());
  });

  it('abre en el paso pedido: la pestaña del popup del lote o la clave del paso', async () => {
    fixture.componentInstance.step.set('footprint');
    await render();
    await open();
    expect(step()).toBe('huella');
  });

  it('Escape cierra solo la ayuda y el foco vuelve al botón', async () => {
    await open();
    const event = await press('Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(isOpen()).toBe(false);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(dialog().querySelector('app-help-guide')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('las teclas no salen del diálogo: los atajos de la pantalla de atrás no se disparan', async () => {
    const listener = vi.fn();
    document.addEventListener('keydown', listener);
    try {
      await open();
      await press('ArrowRight');
      expect(step()).toBe('abrir');
      await press('Escape');
      expect(listener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('la X y Listo cierran; al reabrir arranca otra vez en el paso pedido', async () => {
    fixture.componentInstance.step.set('rentabilidad');
    await render();
    await open();
    await press('ArrowRight');
    expect(step()).toBe('pasaporte');
    next().click();
    await render();
    expect(isOpen()).toBe(false);

    await open();
    expect(step()).toBe('rentabilidad');
    const close = [...dialog().querySelectorAll('button')].find(
      (button) => button.textContent!.trim() === 'Close help',
    )!;
    close.click();
    await render();
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  it('el pedido de cerrar del navegador (Escape o volver en el celular) cierra la ayuda', async () => {
    await open();
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    await render();
    expect(cancel.defaultPrevented).toBe(true);
    expect(isOpen()).toBe(false);
  });

  it('un toque en el fondo cierra; un toque adentro, no', async () => {
    await open();
    const inside = dialog().querySelector<HTMLElement>('figure')!;
    inside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    inside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await render();
    expect(isOpen()).toBe(true);

    dialog().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await render();
    expect(isOpen()).toBe(false);
  });

  it('traba el desplazamiento de la página mientras está abierta y lo devuelve al cerrar', async () => {
    await open();
    expect(root().style.overflow).toBe('hidden');
    await press('Escape');
    expect(root().style.overflow).toBe('');
  });

  it('si la página ya estaba trabada (el popup del lote), no la destraba al cerrar', async () => {
    root().style.overflow = 'hidden';
    await open();
    await press('Escape');
    expect(root().style.overflow).toBe('hidden');
  });

  it('si se destruye abierta (se cerró el popup del lote), devuelve la página como estaba', async () => {
    await open();
    expect(root().style.overflow).toBe('hidden');
    fixture.destroy();
    expect(root().style.overflow).toBe('');
  });
});
