import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PageHeader } from './page-header';

@Component({
  imports: [PageHeader],
  template: `
    <app-page-header kicker="Cuenta demo" heading="Mi campo" subtitle="Cómo están tus lotes.">
      <a actions href="/mapa/nuevo">Marcar lote</a>
      <span class="extra">Dato simulado para la demostración</span>
    </app-page-header>
    <app-page-header class="bare" heading="Huella" />
  `,
})
class Host {}

describe('PageHeader', () => {
  it('muestra kicker, título en h1, subtítulo y las acciones aparte', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const header = (fixture.nativeElement as HTMLElement).querySelector('app-page-header')!;

    expect(header.querySelector('h1')?.textContent?.trim()).toBe('Mi campo');
    expect(header.querySelector('.kicker')?.textContent?.trim()).toBe('Cuenta demo');
    expect(header.querySelector('.subtitle')?.textContent?.trim()).toBe('Cómo están tus lotes.');
    expect(header.querySelector('.actions a')?.textContent).toContain('Marcar lote');
    expect(header.querySelector('.text .extra')).not.toBeNull();
    // un atributo title en el host mostraría un tooltip del navegador
    expect(header.hasAttribute('title')).toBe(false);
  });

  it('sin kicker ni subtítulo no deja párrafos vacíos', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const bare = (fixture.nativeElement as HTMLElement).querySelector('.bare')!;

    expect(bare.querySelector('h1')?.textContent?.trim()).toBe('Huella');
    expect(bare.querySelectorAll('p').length).toBe(0);
    expect(bare.querySelector('.actions')?.children.length).toBe(0);
  });
});
