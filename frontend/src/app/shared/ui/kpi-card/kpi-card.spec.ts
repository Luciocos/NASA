import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KpiCard } from './kpi-card';

@Component({
  imports: [KpiCard],
  template: `
    <app-kpi-card label="Lluvia" [value]="44" unit="mm">
      <span class="source">Fuente: NASA POWER</span>
    </app-kpi-card>
  `,
})
class Host {}

describe('KpiCard', () => {
  let fixture: ComponentFixture<KpiCard>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [KpiCard, Host] }).compileComponents();
    fixture = TestBed.createComponent(KpiCard);
    fixture.componentRef.setInput('label', 'Tus hectáreas');
  });

  it('muestra el valor en es-AR con su unidad y su significado', async () => {
    fixture.componentRef.setInput('value', 24.9);
    fixture.componentRef.setInput('unit', 'ha');
    fixture.componentRef.setInput('caption', 'Superficie de tus lotes');
    await fixture.whenStable();

    expect(el().querySelector('.amount')?.textContent?.trim()).toBe('24.9');
    expect(el().querySelector('.unit')?.textContent?.trim()).toBe('ha');
    expect(el().querySelector('.caption')?.textContent).toContain('Superficie de tus lotes');
    expect(el().getAttribute('role')).toBe('group');
    const label = el().querySelector('.label');
    expect(el().getAttribute('aria-labelledby')).toBe(label?.id);
  });

  it('sin dato no inventa un cero: dice "Sin dato" y el motivo', async () => {
    fixture.componentRef.setInput('value', null);
    fixture.componentRef.setInput('emptyReason', 'Nubes en todas las pasadas');
    await fixture.whenStable();

    expect(el().querySelector('.value')?.textContent?.trim()).toBe('No data');
    expect(el().textContent).toContain('Nubes en todas las pasadas');
    expect(el().querySelector('.amount')).toBeNull();
  });

  it('mientras carga muestra el esqueleto y avisa que está ocupado', async () => {
    fixture.componentRef.setInput('value', 3);
    fixture.componentRef.setInput('loading', true);
    await fixture.whenStable();

    expect(el().getAttribute('aria-busy')).toBe('true');
    expect(el().querySelector('.skeleton')).not.toBeNull();
    expect(el().querySelector('.value')).toBeNull();
  });

  it('la tendencia se muestra solo con texto, no solo con la flecha', async () => {
    fixture.componentRef.setInput('value', 3);
    fixture.componentRef.setInput('trend', 'up');
    await fixture.whenStable();
    expect(el().querySelector('.trend')).toBeNull();

    fixture.componentRef.setInput('trendText', 'Más que el mes pasado');
    fixture.componentRef.setInput('trendTone', 'good');
    await fixture.whenStable();
    expect(el().querySelector('.trend')?.textContent).toContain('Más que el mes pasado');
    expect(el().querySelector('.trend')?.getAttribute('data-tone')).toBe('good');
  });

  it('lleva la fuente y el origen al pie', async () => {
    const host = TestBed.createComponent(Host);
    await host.whenStable();
    const card = (host.nativeElement as HTMLElement).querySelector('app-kpi-card')!;
    expect(card.querySelector('.foot .source')?.textContent).toContain('NASA POWER');
    expect(card.querySelector('.amount')?.textContent?.trim()).toBe('44');
  });
});
