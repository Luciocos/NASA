import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { LotDetail } from '../../../core/models';
import { LotTabs } from './lot-tabs';

@Component({ template: '' })
class Blank {}

// lote armado para la prueba: no representa un lote real
const LOT: LotDetail = {
  id: 7,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: { type: 'Polygon', coordinates: [] },
  area_ha: 24.94,
  event_count: 0,
  created_at: '2026-11-14T10:00:00Z',
  is_example: false,
  owned: true,
  campaigns: [],
};

describe('LotTabs', () => {
  let fixture: ComponentFixture<LotTabs>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const tabs = () => [...el().querySelectorAll<HTMLAnchorElement>('nav a')];
  const back = () => el().querySelector<HTMLAnchorElement>('a.back');
  const button = (label: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

  async function setup(url = '/', inputs: Record<string, unknown> = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [LotTabs],
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    await TestBed.inject(Router).navigateByUrl(url);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LotTabs);
    fixture.componentRef.setInput('lotId', 7);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  }

  it('lleva a las pestañas del lote, en una sola fila', async () => {
    await setup();
    expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
      'Satélite',
      'Bitácora',
      'Prácticas',
      'Huella',
      'Fertilización',
      'Rentabilidad',
      'Cuenca y Caudal',
    ]);
    expect(tabs().map((tab) => tab.getAttribute('href'))).toEqual([
      '/lotes/7',
      '/lotes/7/bitacora',
      '/lotes/7/practicas',
      '/huella/7',
      '/lotes/7/fertilizacion',
      '/lotes/7/rentabilidad',
      '/lotes/7/cuenca',
    ]);
    expect(el().querySelector('nav')?.getAttribute('aria-label')).toBe('Secciones del lote');
    // sin el lote, el encabezado es solo la vuelta: nada más arriba
    expect(back()?.textContent?.trim()).toBe('Mi campo');
    expect(back()?.getAttribute('href')).toBe('/mapa');
    expect(el().querySelector('h1')).toBeNull();
    expect(el().querySelector('app-more-menu')).toBeNull();
  });

  it('marca la pestaña activa con aria-current, también con consulta o fragmento', async () => {
    await setup('/lotes/7/bitacora?evento=3#detalle');
    const current = tabs().filter((tab) => tab.getAttribute('aria-current') === 'page');
    expect(current.map((tab) => tab.textContent?.trim())).toEqual(['Bitácora']);
    expect(current[0].querySelector('.indicator')).toBeTruthy();
    expect(el().querySelectorAll('.indicator').length).toBe(1);
  });

  it('la ficha (Satélite) solo es activa en su ruta exacta', async () => {
    await setup('/lotes/7');
    expect(el().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Satélite');
  });

  it('con el lote, el encabezado muestra nombre, superficie, lugar y el menú del dueño', async () => {
    await setup('/lotes/7', { lot: LOT });
    expect(el().querySelector('h1')?.textContent?.trim()).toBe('Lote de prueba');
    expect(el().querySelector('h1')?.id).toBe('lot-title-7');
    expect(el().querySelector('.meta')?.textContent?.trim()).toBe('24,9 ha · Casilda, Santa Fe');
    expect(el().textContent).not.toContain('solo lectura');
    const menu = el().querySelector('app-more-menu button');
    expect(menu?.getAttribute('aria-label')).toBe('Más opciones del lote');
    expect(button('Compartir pasaporte')).toBeDefined();
  });

  it('en un ejemplo vuelve a Ejemplos, avisa que es de solo lectura y no ofrece el menú', async () => {
    await setup('/lotes/7', { lot: { ...LOT, is_example: true, owned: false } });
    expect(back()?.textContent?.trim()).toBe('Ejemplos');
    expect(back()?.getAttribute('href')).toBe('/ejemplos');
    expect(el().querySelector('.example')?.textContent).toContain('Lote de ejemplo · solo lectura');
    expect(el().querySelector('app-more-menu')).toBeNull();
  });

  it('sin el lote, el input example sigue llevando la vuelta a Ejemplos', async () => {
    await setup('/', { example: true });
    expect(back()?.getAttribute('href')).toBe('/ejemplos');
  });

  describe('en el popup del lote', () => {
    const roleTabs = () => [...el().querySelectorAll<HTMLButtonElement>('[role="tab"]')];

    it('son pestañas de verdad: una sola fila, la activa elegida y el panel que muestran', async () => {
      await setup('/mapa?lote=7', {
        lot: LOT,
        mode: 'dialog',
        active: 'footprint',
        panelId: 'lot-panel-7',
      });
      expect(el().querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
        'Secciones del lote',
      );
      expect(roleTabs().map((tab) => tab.textContent?.trim())).toEqual([
        'Satélite',
        'Bitácora',
        'Prácticas',
        'Huella',
        'Fertilización',
        'Rentabilidad',
        'Cuenca y Caudal',
      ]);
      const selected = roleTabs().filter((tab) => tab.getAttribute('aria-selected') === 'true');
      expect(selected.map((tab) => tab.textContent?.trim())).toEqual(['Huella']);
      expect(selected[0].id).toBe('lot-tab-7-footprint');
      expect(selected[0].tabIndex).toBe(0);
      expect(roleTabs()[0].tabIndex).toBe(-1);
      expect(roleTabs().every((tab) => tab.getAttribute('aria-controls') === 'lot-panel-7')).toBe(
        true,
      );
      // sin enlaces a las rutas ni vuelta: el popup se cierra con Cerrar
      expect(el().querySelector('nav')).toBeNull();
      expect(back()).toBeNull();
      expect(el().querySelector('h2')?.textContent?.trim()).toBe('Lote de prueba');
      expect(el().querySelector('h1')).toBeNull();
      expect(button('Cerrar')).toBeDefined();
    });

    it('avisa la pestaña elegida (con toque o flechas) y el pedido de cerrar', async () => {
      await setup('/mapa?lote=7', { lot: LOT, mode: 'dialog', active: 'satellite' });
      const picked: string[] = [];
      let closed = 0;
      fixture.componentInstance.tabChange.subscribe((key) => picked.push(key));
      fixture.componentInstance.closed.subscribe(() => closed++);

      roleTabs()[5].click();
      roleTabs()[0].click();
      const key = (name: string) =>
        roleTabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
      key('ArrowRight');
      key('ArrowLeft');
      key('End');
      expect(picked).toEqual(['profit', 'log', 'water', 'water']);
      expect(document.activeElement?.id).toBe('lot-tab-7-water');

      button('Cerrar')?.click();
      expect(closed).toBe(1);
    });
  });

  describe('compartir el pasaporte', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    afterEach(() => {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: unknown }).clipboard;
    });

    it('genera el enlace, lo copia y deja abrirlo', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await setup('/lotes/7', { lot: LOT });

      button('Compartir pasaporte')?.click();
      fixture.detectChanges();
      expect(el().textContent).toContain('Generando el enlace…');
      const request = http.expectOne('/api/lots/7/passport/');
      expect(request.request.method).toBe('POST');
      request.flush({
        token: 'abc',
        lot: 7,
        url: '/pasaporte/abc',
        created_at: '2026-11-15T10:00:00Z',
        expires_at: null,
      });
      await fixture.whenStable();

      expect(writeText).toHaveBeenCalledWith(new URL('/pasaporte/abc', document.baseURI).href);
      expect(el().textContent).toContain('Enlace copiado');
      const open = [...el().querySelectorAll('a')].find((a) =>
        a.textContent?.includes('Abrir el pasaporte'),
      );
      expect(open?.getAttribute('href')).toBe('/pasaporte/abc');

      // la segunda vez copia el mismo enlace, sin generar otro
      button('Compartir pasaporte')?.click();
      await fixture.whenStable();
      http.expectNone('/api/lots/7/passport/');
      expect(writeText).toHaveBeenCalledTimes(2);
    });

    it('si el navegador no deja copiar, muestra el enlace para copiarlo a mano', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('sin permiso'));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      await setup('/lotes/7', { lot: LOT });

      button('Compartir pasaporte')?.click();
      http.expectOne('/api/lots/7/passport/').flush({
        token: 'abc',
        lot: 7,
        url: '/pasaporte/abc',
        created_at: '2026-11-15T10:00:00Z',
        expires_at: null,
      });
      await fixture.whenStable();

      expect(el().textContent).toContain('Copiá el enlace');
      const field = el().querySelector<HTMLInputElement>('input.share__url');
      expect(field?.value).toBe(new URL('/pasaporte/abc', document.baseURI).href);
      expect(field?.readOnly).toBe(true);
    });

    it('si falla, lo dice y deja probar de nuevo', async () => {
      await setup('/lotes/7', { lot: LOT });

      button('Compartir pasaporte')?.click();
      http
        .expectOne('/api/lots/7/passport/')
        .flush('', { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();

      const alert = el().querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('No se pudo generar el pasaporte');
      button('Compartir pasaporte')?.click();
      http.expectOne('/api/lots/7/passport/');
    });
  });
});
