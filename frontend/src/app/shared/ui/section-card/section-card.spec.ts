import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SectionCard } from './section-card';

@Component({
  imports: [SectionCard],
  template: `
    <app-section-card class="main" heading="Bitácora" subtitle="Lo que detectaron los satélites.">
      <button actions type="button">Filtrar</button>
      <p class="content">Siembra</p>
      <p footer class="source">Fuente: NISAR</p>
    </app-section-card>
    <app-section-card class="nested" heading="Detalle" level="3" flush>
      <p class="content">Mapa</p>
    </app-section-card>
  `,
})
class Host {}

describe('SectionCard', () => {
  async function render(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('pone el título, el subtítulo y las acciones en el encabezado y el resto en el cuerpo', async () => {
    const main = (await render()).querySelector('.main')!;

    expect(main.querySelector('h2')?.textContent?.trim()).toBe('Bitácora');
    expect(main.querySelector('.subtitle')?.textContent?.trim()).toBe(
      'Lo que detectaron los satélites.',
    );
    expect(main.querySelector('.head .actions button')?.textContent).toContain('Filtrar');
    expect(main.querySelector('.body .content')?.textContent).toContain('Siembra');
    expect(main.querySelector('.foot .source')?.textContent).toContain('NISAR');
    expect(main.querySelector('.body .source')).toBeNull();
    expect(main.classList.contains('is-flush')).toBe(false);
  });

  it('acepta un h3 y el cuerpo sin relleno', async () => {
    const nested = (await render()).querySelector('.nested')!;

    expect(nested.querySelector('h3')?.textContent?.trim()).toBe('Detalle');
    expect(nested.querySelector('h2')).toBeNull();
    expect(nested.classList.contains('is-flush')).toBe(true);
    expect(nested.querySelector('.subtitle')).toBeNull();
    expect(nested.querySelector('.foot')?.children.length).toBe(0);
  });
});
