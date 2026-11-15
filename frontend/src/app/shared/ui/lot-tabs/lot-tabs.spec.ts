import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LotTabs } from './lot-tabs';

describe('LotTabs', () => {
  let fixture: ComponentFixture<LotTabs>;
  const links = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LotTabs],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(LotTabs);
    fixture.componentRef.setInput('lotId', 7);
  });

  it('en un lote propio vuelve a Mi campo y lleva a las cuatro secciones', async () => {
    await fixture.whenStable();
    const [back, ...tabs] = links();
    expect(back.textContent?.trim()).toBe('Mi campo');
    expect(back.getAttribute('href')).toBe('/mapa');
    expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual([
      '/lotes/7',
      '/huella/7',
      '/lotes/7/fertilizacion',
      '/lotes/7/rentabilidad',
    ]);
    // el rótulo corto del celular no se lee dos veces: el nombre accesible es el largo
    expect(tabs[0].querySelector('.short')?.getAttribute('aria-hidden')).toBe('true');
    expect(tabs[0].querySelector('.long')?.textContent).toBe('Ficha y datos NASA');
  });

  it('en un ejemplo vuelve a Ejemplos', async () => {
    fixture.componentRef.setInput('example', true);
    await fixture.whenStable();
    const [back] = links();
    expect(back.textContent?.trim()).toBe('Ejemplos');
    expect(back.getAttribute('href')).toBe('/ejemplos');
  });
});
