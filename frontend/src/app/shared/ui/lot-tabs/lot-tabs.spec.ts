import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { LotDetail, ORIGIN_LABELS } from '../../../core/models';
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
    fixture = TestBed.createComponent(LotTabs);
    fixture.componentRef.setInput('lotId', 7);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  }

  it('lleva a las pestañas del lote, en una sola fila', async () => {
    await setup();
    expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
      'Satellite',
      'Field log',
      'Practices',
      'Footprint',
      'Fertilization',
      'Profitability',
      'Watershed',
      'Passport',
    ]);
    expect(tabs().map((tab) => tab.getAttribute('href'))).toEqual([
      '/lotes/7',
      '/lotes/7/bitacora',
      '/lotes/7/practicas',
      '/huella/7',
      '/lotes/7/fertilizacion',
      '/lotes/7/rentabilidad',
      '/lotes/7/cuenca',
      '/lotes/7/pasaporte',
    ]);
    expect(el().querySelector('nav')?.getAttribute('aria-label')).toBe('Field sections');
    // sin el lote, el encabezado es solo la vuelta: nada más arriba
    expect(back()?.textContent?.trim()).toBe('My fields');
    expect(back()?.getAttribute('href')).toBe('/mapa');
    expect(el().querySelector('h1')).toBeNull();
    expect(el().querySelector('app-more-menu')).toBeNull();
  });

  it('marca la pestaña activa con aria-current, también con consulta o fragmento', async () => {
    await setup('/lotes/7/bitacora?evento=3#detalle');
    const current = tabs().filter((tab) => tab.getAttribute('aria-current') === 'page');
    expect(current.map((tab) => tab.textContent?.trim())).toEqual(['Field log']);
    expect(current[0].querySelector('.indicator')).toBeTruthy();
    expect(el().querySelectorAll('.indicator').length).toBe(1);
  });

  it('la ficha (Satélite) solo es activa en su ruta exacta', async () => {
    await setup('/lotes/7');
    expect(el().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Satellite');
  });

  it('con el lote, el encabezado muestra nombre, superficie y lugar, sin menú ⋯ ni pasaporte', async () => {
    await setup('/lotes/7', { lot: LOT });
    expect(el().querySelector('h1')?.textContent?.trim()).toBe('Lote de prueba');
    expect(el().querySelector('h1')?.id).toBe('lot-title-7');
    expect(el().querySelector('.meta')?.textContent?.trim()).toBe('24.9 ha · Casilda, Santa Fe');
    expect(el().textContent).not.toContain('read-only');
    // compartir el pasaporte es su pestaña: el menú ⋯ queda solo para el RENSPA
    expect(el().querySelector('app-more-menu')).toBeNull();
    expect(button('Share passport')).toBeUndefined();
  });

  it('el RENSPA que cargó el productor va en el menú ⋯, con su origen, y no en el encabezado', async () => {
    await setup('/lotes/7', { lot: { ...LOT, renspa: '01.234.5.67890/00' } });
    const note = el().querySelector('app-more-menu .menu-note');
    expect(note?.textContent).toContain('RENSPA 01.234.5.67890/00');
    expect(note?.querySelector('app-origin-badge')?.textContent).toContain(ORIGIN_LABELS.DECLARED);
    expect(el().querySelector('app-more-menu button')?.getAttribute('aria-label')).toBe(
      'More field options',
    );
    expect(el().querySelector('.meta')?.textContent).not.toContain('RENSPA');
  });

  it('en un ejemplo vuelve a Ejemplos, avisa que es de solo lectura y no ofrece el menú', async () => {
    await setup('/lotes/7', {
      lot: { ...LOT, is_example: true, owned: false, renspa: '01.234.5.67890/00' },
    });
    expect(back()?.textContent?.trim()).toBe('Examples');
    expect(back()?.getAttribute('href')).toBe('/ejemplos');
    expect(el().querySelector('.example')?.textContent).toContain('Sample field · read-only');
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
        'Field sections',
      );
      expect(roleTabs().map((tab) => tab.textContent?.trim())).toEqual([
        'Satellite',
        'Field log',
        'Practices',
        'Footprint',
        'Fertilization',
        'Profitability',
        'Watershed',
        'Passport',
      ]);
      const selected = roleTabs().filter((tab) => tab.getAttribute('aria-selected') === 'true');
      expect(selected.map((tab) => tab.textContent?.trim())).toEqual(['Footprint']);
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
      expect(button('Close')).toBeDefined();
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
      expect(picked).toEqual(['profit', 'log', 'passport', 'passport']);
      expect(document.activeElement?.id).toBe('lot-tab-7-passport');

      button('Close')?.click();
      expect(closed).toBe(1);
    });

    it('al cambiar el ancho del popup la fila vuelve a marcar si hay más pestañas', async () => {
      const observers: (() => void)[] = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            observers.push(callback);
          }
          observe(): void {
            // la prueba avisa el cambio de ancho a mano
          }
          disconnect(): void {
            // nada que soltar
          }
        },
      );
      try {
        await setup('/mapa?lote=7', { lot: LOT, mode: 'dialog', active: 'satellite' });
        const track = el().querySelector<HTMLElement>('.track')!;
        const size = (scroll: number, client: number) => {
          Object.defineProperty(track, 'scrollWidth', { configurable: true, value: scroll });
          Object.defineProperty(track, 'clientWidth', { configurable: true, value: client });
          observers.forEach((callback) => callback());
          fixture.detectChanges();
        };
        expect(observers.length).toBe(1);

        // se achicó: no entran las seis y el borde lo avisa
        size(720, 360);
        expect(track.classList).toContain('fade-end');
        // se agrandó: entran todas y el borde ya no se esfuma
        size(720, 720);
        expect(track.classList).not.toContain('fade-end');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
