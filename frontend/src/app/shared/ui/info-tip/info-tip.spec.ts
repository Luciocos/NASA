import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InfoTip } from './info-tip';

@Component({
  imports: [InfoTip],
  template: `
    <app-info-tip label="¿De dónde sale cada dato?"><p>Verificado: satélite.</p></app-info-tip>
    <app-info-tip label="Cómo se calcula"><p>Suma los puntos.</p></app-info-tip>
  `,
})
class Host {}

/** el evento de popover con su estado nuevo, como lo dispara el navegador */
function toggle(type: 'beforetoggle' | 'toggle', newState: 'open' | 'closed'): Event {
  return Object.assign(new Event(type), {
    newState,
    oldState: newState === 'open' ? 'closed' : 'open',
  });
}

describe('InfoTip', () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;
  const buttons = () => [...el().querySelectorAll('button')];
  const panels = () => [...el().querySelectorAll<HTMLElement>('[popover]')];
  const button = () => buttons()[0];
  const panel = () => panels()[0];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('un botón (i) con nombre que abre la ayuda, con el contenido siempre en el DOM', () => {
    expect(button().getAttribute('aria-label')).toBe('¿De dónde sale cada dato?');
    expect(button().getAttribute('popovertarget')).toBe(panel().id);
    expect(panel().getAttribute('popover')).not.toBeNull();
    expect(panel().textContent).toContain('¿De dónde sale cada dato?');
    expect(panel().textContent).toContain('Verificado: satélite.');
  });

  it('cada ayuda tiene su propio id: un (i) nunca abre la de otro', () => {
    const [first, second] = panels();
    expect(first.id).not.toBe(second.id);
    expect(buttons()[1].getAttribute('popovertarget')).toBe(second.id);
    expect(second.textContent).toContain('Suma los puntos.');
  });

  it('se ubica debajo del botón sin salirse de la ventana', () => {
    vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 2, y: 100, width: 44, height: 44 }),
    );
    panel().dispatchEvent(toggle('beforetoggle', 'open'));
    expect(panel().style.top).toBe('150px');
    expect(panel().style.left).toBe('12px');
  });

  it('si no entra abajo, pasa arriba del botón', () => {
    vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 100, y: window.innerHeight - 60, width: 44, height: 44 }),
    );
    vi.spyOn(panel(), 'offsetHeight', 'get').mockReturnValue(200);
    panel().dispatchEvent(toggle('beforetoggle', 'open'));
    panel().dispatchEvent(toggle('toggle', 'open'));
    expect(panel().style.top).toBe(`${window.innerHeight - 60 - 6 - 200}px`);
  });

  it('se cierra sola al desplazar la página, pero no al desplazar la propia ayuda', () => {
    const hide = vi.fn();
    Object.assign(panel(), { hidePopover: hide });
    panel().dispatchEvent(toggle('toggle', 'open'));
    panel().dispatchEvent(new Event('scroll'));
    expect(hide).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('scroll'));
    expect(hide).toHaveBeenCalledTimes(1);
    // ya cerrada deja de escuchar
    panel().dispatchEvent(toggle('toggle', 'closed'));
    document.dispatchEvent(new Event('scroll'));
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
