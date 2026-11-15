import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Disclosure } from './disclosure';

describe('Disclosure', () => {
  let fixture: ComponentFixture<Disclosure>;
  const details = () => (fixture.nativeElement as HTMLElement).querySelector('details')!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Disclosure] }).compileComponents();
    fixture = TestBed.createComponent(Disclosure);
    await fixture.whenStable();
  });

  it('arranca cerrado y con el rótulo "Ver detalle técnico"', () => {
    expect(details().open).toBe(false);
    expect(details().querySelector('summary')?.textContent).toContain('Ver detalle técnico');
  });

  it('se abre desde afuera y sigue lo que hace la persona', async () => {
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    expect(details().open).toBe(true);

    details().open = false;
    details().dispatchEvent(new Event('toggle'));
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('muestra la aclaración y el rótulo propio', async () => {
    fixture.componentRef.setInput('label', 'Cómo leer la maqueta');
    fixture.componentRef.setInput('hint', 'Texturas y globos');
    await fixture.whenStable();
    const summary = details().querySelector('summary')?.textContent ?? '';
    expect(summary).toContain('Cómo leer la maqueta');
    expect(summary).toContain('Texturas y globos');
  });
});
