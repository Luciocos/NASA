import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MoreMenu } from './more-menu';

@Component({
  imports: [MoreMenu],
  template: `
    <app-more-menu label="Más opciones de la maqueta" text="Más">
      <button type="button" class="menu-item fit" (click)="fitted.set(fitted() + 1)">
        Ver todos los lotes
      </button>
      <button
        type="button"
        class="menu-item grid"
        [attr.aria-pressed]="grid()"
        (click)="grid.set(!grid())"
      >
        Grilla de hectáreas
      </button>
    </app-more-menu>
  `,
})
class Host {
  readonly fitted = signal(0);
  readonly grid = signal(true);
}

describe('MoreMenu', () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;
  const trigger = () => el().querySelector<HTMLButtonElement>('app-more-menu > button')!;
  const panel = () => el().querySelector<HTMLElement>('.panel')!;
  const item = (name: 'fit' | 'grid') => el().querySelector<HTMLButtonElement>(`.${name}`)!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  async function openMenu(): Promise<void> {
    trigger().click();
    await fixture.whenStable();
  }

  it('el botón tiene nombre accesible y el menú arranca cerrado', () => {
    expect(trigger().getAttribute('aria-label')).toBe('Más opciones de la maqueta');
    expect(trigger().textContent).toContain('Más');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().hasAttribute('aria-controls')).toBe(false);
    expect(panel().hidden).toBe(true);
  });

  it('abre la lista y aria-controls apunta a ella', async () => {
    await openMenu();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(trigger().getAttribute('aria-controls')!)).toBe(panel());
    expect(panel().hidden).toBe(false);
  });

  it('elegir una acción la hace y cierra el menú; un interruptor lo deja abierto', async () => {
    await openMenu();
    item('grid').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.grid()).toBe(false);
    expect(item('grid').getAttribute('aria-pressed')).toBe('false');
    expect(panel().hidden).toBe(false);

    item('fit').focus();
    item('fit').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.fitted()).toBe(1);
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('Escape cierra el menú y devuelve el foco al botón', async () => {
    await openMenu();
    item('fit').focus();

    item('fit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('un toque fuera del menú lo cierra y uno adentro no', async () => {
    await openMenu();

    panel().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(panel().hidden).toBe(false);

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(panel().hidden).toBe(true);
  });

  it('flecha abajo abre el menú, enfoca la primera acción y las recorre', async () => {
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(panel().hidden).toBe(false);
    expect(document.activeElement).toBe(item('fit'));

    const press = (key: string) =>
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press('ArrowDown');
    expect(document.activeElement).toBe(item('grid'));
    press('ArrowDown');
    expect(document.activeElement).toBe(item('fit'));
    press('ArrowUp');
    expect(document.activeElement).toBe(item('grid'));
  });
});
