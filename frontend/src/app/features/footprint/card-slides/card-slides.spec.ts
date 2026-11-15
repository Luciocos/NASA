import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardSlides } from './card-slides';

@Component({
  imports: [CardSlides],
  template: `
    <app-card-slides label="Resumen de prueba">
      <div>Uno</div>
      <div>Dos</div>
      <div>Tres</div>
    </app-card-slides>
  `,
})
class Host {}

describe('CardSlides', () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;
  const track = () => el().querySelector<HTMLElement>('.track')!;
  const button = (label: string) =>
    el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('es una región con nombre y cada tarjeta dice su lugar', () => {
    const region = el().querySelector('app-card-slides')!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-roledescription')).toBe('carrusel');
    expect(region.getAttribute('aria-label')).toBe('Resumen de prueba');
    const slides = [...track().children];
    expect(slides.map((s) => s.getAttribute('aria-label'))).toEqual(['1 de 3', '2 de 3', '3 de 3']);
    expect(slides.map((s) => s.getAttribute('role'))).toEqual(['group', 'group', 'group']);
  });

  it('si entran todas no muestra botones', () => {
    expect(button('Anterior')).toBeNull();
    expect(button('Siguiente')).toBeNull();
  });

  it('si no entran: anterior, siguiente y la posición', async () => {
    Object.defineProperty(track(), 'scrollWidth', { configurable: true, value: 900 });
    Object.defineProperty(track(), 'clientWidth', { configurable: true, value: 300 });
    const scrollTo = vi.fn();
    track().scrollTo = scrollTo;
    track().dispatchEvent(new Event('scroll'));
    await fixture.whenStable();

    expect(el().querySelector('.count')?.textContent?.trim()).toBe('1 de 3');
    expect(button('Anterior')!.disabled).toBe(true);
    expect(button('Siguiente')!.disabled).toBe(false);
    button('Siguiente')!.click();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
