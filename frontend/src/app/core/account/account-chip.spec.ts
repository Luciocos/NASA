import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideOfflineTesting } from '../offline/testing';
import { AccountChip } from './account-chip';
import { DemoAccount } from './demo-account';

describe('AccountChip', () => {
  let fixture: ComponentFixture<AccountChip>;
  let chip: HTMLButtonElement;

  const menu = (): HTMLElement | null => fixture.nativeElement.querySelector('.menu');

  async function openMenu(): Promise<HTMLElement> {
    chip.click();
    await fixture.whenStable();
    return menu()!;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClientTesting(), provideOfflineTesting()],
    });
    TestBed.inject(DemoAccount).start();
    fixture = TestBed.createComponent(AccountChip);
    await fixture.whenStable();
    chip = fixture.nativeElement.querySelector('.chip-btn');
  });

  it('aria-controls apunta al menú solo mientras está abierto', async () => {
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(chip.hasAttribute('aria-controls')).toBe(false);

    const opened = await openMenu();

    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(chip.getAttribute('aria-controls')!)).toBe(opened);
  });

  it('Escape cierra el menú y devuelve el foco al chip', async () => {
    const exit = (await openMenu()).querySelector('button')!;
    exit.focus();

    exit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it('Escape no le saca el foco a otra parte de la pantalla', async () => {
    const other = document.createElement('button');
    document.body.append(other);
    await openMenu();
    other.focus();

    other.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('un toque fuera del menú lo cierra y uno adentro no', async () => {
    const opened = await openMenu();

    opened.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(menu()).not.toBeNull();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(menu()).toBeNull();
  });
});
