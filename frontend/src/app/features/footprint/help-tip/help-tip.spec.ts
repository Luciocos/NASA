import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HelpTip } from './help-tip';

@Component({
  imports: [HelpTip],
  template: `<app-help-tip label="¿De dónde sale cada dato?"
    ><p>Verificado: satélite.</p></app-help-tip
  >`,
})
class Host {}

/** el evento de popover con su estado nuevo, como lo dispara el navegador */
function toggle(type: 'beforetoggle' | 'toggle', newState: 'open' | 'closed'): Event {
  return Object.assign(new Event(type), {
    newState,
    oldState: newState === 'open' ? 'closed' : 'open',
  });
}

describe('HelpTip', () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;
  const button = () => el().querySelector('button')!;
  const panel = () => el().querySelector<HTMLElement>('[popover]')!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('un botón (i) con nombre que abre la ayuda, con el contenido siempre en el DOM', () => {
    expect(button().getAttribute('aria-label')).toBe('¿De dónde sale cada dato?');
    expect(button().getAttribute('popovertarget')).toBe(panel().id);
    expect(panel().textContent).toContain('¿De dónde sale cada dato?');
    expect(panel().textContent).toContain('Verificado: satélite.');
  });

  it('se ubica debajo del botón sin salirse de la ventana', () => {
    vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 2, y: 100, width: 44, height: 44 }),
    );
    panel().dispatchEvent(toggle('beforetoggle', 'open'));
    expect(panel().style.top).toBe('150px');
    expect(panel().style.left).toBe('12px');
  });

  it('se cierra sola al desplazar la página', () => {
    const hide = vi.fn();
    Object.assign(panel(), { hidePopover: hide });
    panel().dispatchEvent(toggle('toggle', 'open'));
    document.dispatchEvent(new Event('scroll'));
    expect(hide).toHaveBeenCalledTimes(1);
    // ya cerrada deja de escuchar
    panel().dispatchEvent(toggle('toggle', 'closed'));
    document.dispatchEvent(new Event('scroll'));
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
