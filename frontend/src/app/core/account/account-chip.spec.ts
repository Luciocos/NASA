import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AUTH_STORAGE_KEY } from '../auth/auth-session';
import { AuthService } from '../auth/auth.service';
import { TEST_TOKEN, TEST_USER, storeTestSession } from '../auth/testing';
import { MemoryStorage, OFFLINE_STORAGE } from '../offline/storage';
import { AccountChip } from './account-chip';

@Component({ template: '' })
class Blank {}

describe('AccountChip', () => {
  let fixture: ComponentFixture<AccountChip>;
  let storage: MemoryStorage;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const chip = (): HTMLButtonElement => el().querySelector('button.chip-btn')!;
  const menu = (): HTMLElement | null => el().querySelector('.menu');

  async function setup(signedIn = true, url = '/lotes/5'): Promise<void> {
    storage = new MemoryStorage();
    if (signedIn) storeTestSession(storage);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        provideHttpClientTesting(),
        { provide: OFFLINE_STORAGE, useValue: storage },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture = TestBed.createComponent(AccountChip);
    await fixture.whenStable();
  }

  async function openMenu(): Promise<HTMLElement> {
    chip().click();
    await fixture.whenStable();
    return menu()!;
  }

  afterEach(() => http.verify());

  describe('con la sesión abierta', () => {
    beforeEach(() => setup());

    it('muestra quién ingresó y, en el menú, su mail y que sus datos son privados', async () => {
      expect(chip().textContent).toContain('Cuenta de');
      expect(chip().textContent).toContain(TEST_USER.name);
      expect(chip().querySelector('.avatar')?.textContent?.trim()).toBe('A');

      const opened = await openMenu();

      expect(opened.textContent).toContain(TEST_USER.email);
      expect(opened.textContent).toContain('Tus lotes y tus datos son privados: solo vos los ves.');
      expect(opened.querySelector('a[href="/ejemplos"]')).not.toBeNull();
      expect(opened.querySelector('.alert')).toBeNull();
    });

    it('aria-controls apunta al menú solo mientras está abierto', async () => {
      expect(chip().getAttribute('aria-expanded')).toBe('false');
      expect(chip().hasAttribute('aria-controls')).toBe(false);

      const opened = await openMenu();

      expect(chip().getAttribute('aria-expanded')).toBe('true');
      expect(document.getElementById(chip().getAttribute('aria-controls')!)).toBe(opened);
    });

    it('Escape cierra el menú y devuelve el foco al chip', async () => {
      const exit = (await openMenu()).querySelector('button')!;
      exit.focus();

      exit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();

      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(chip());
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

    it('Salir cierra la sesión, borra lo del usuario y vuelve al inicio', async () => {
      storage.setItem('lotestigo:u7:profit:v1', '{}');
      const opened = await openMenu();
      const exit = [...opened.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Salir',
      )!;

      exit.click();
      await fixture.whenStable();

      const revoke = http.expectOne('/api/auth/logout/');
      expect(revoke.request.headers.get('Authorization')).toBe(`Token ${TEST_TOKEN}`);
      revoke.flush(null, { status: 204, statusText: 'No Content' });
      expect(TestBed.inject(AuthService).loggedIn()).toBe(false);
      expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(storage.getItem('lotestigo:u7:profit:v1')).toBeNull();
      expect(TestBed.inject(Router).url).toBe('/');
      expect(el().querySelector('a.chip-btn')?.textContent).toContain('Ingresar');
    });

    it('avisa antes de salir si hay lotes sin subir en el dispositivo', async () => {
      TestBed.resetTestingModule();
      storage = new MemoryStorage();
      storeTestSession(storage);
      storage.setItem(
        'lotestigo:u7:outbox:v1',
        JSON.stringify([
          {
            localId: 'a',
            body: { name: 'Lote nuevo', geometry: { type: 'Polygon', coordinates: [] } },
            createdAt: '2026-11-14T10:00:00.000Z',
            attempts: 1,
            rejected: false,
            error: null,
          },
        ]),
      );
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideHttpClientTesting(),
          { provide: OFFLINE_STORAGE, useValue: storage },
        ],
      });
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(AccountChip);
      await fixture.whenStable();

      const opened = await openMenu();

      expect(opened.querySelector('.alert--warn')?.textContent).toContain(
        'Tenés 1 lote sin subir en este dispositivo: si salís, se borra.',
      );
    });
  });

  describe('sin sesión', () => {
    it('ofrece ingresar y volver después a la pantalla donde estaba', async () => {
      await setup(false, '/lotes/5');

      const link = el().querySelector<HTMLAnchorElement>('a.chip-btn')!;
      expect(link.textContent).toContain('Ingresar');
      expect(link.getAttribute('href')).toBe('/ingresar?volver=%2Flotes%2F5');
      expect(link.hasAttribute('aria-current')).toBe(false);
      expect(el().querySelector('button.chip-btn')).toBeNull();
    });

    it('en la pantalla de ingreso queda marcada y conserva ?volver=', async () => {
      await setup(false, '/ingresar?volver=%2Fmapa');

      const link = el().querySelector<HTMLAnchorElement>('a.chip-btn')!;
      expect(link.getAttribute('aria-current')).toBe('page');
      expect(link.getAttribute('href')).toBe('/ingresar?volver=%2Fmapa');
    });
  });
});
