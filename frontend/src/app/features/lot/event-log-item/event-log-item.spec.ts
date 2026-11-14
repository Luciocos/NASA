import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventLogItem } from '../../../core/models';
import { makeEvent } from '../testing';
import { EventLogItemCard } from './event-log-item';

describe('EventLogItemCard', () => {
  let fixture: ComponentFixture<EventLogItemCard>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventLogItemCard],
      providers: [provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(EventLogItemCard);
    http = TestBed.inject(HttpTestingController);
  });

  it('muestra tipo, fecha con incertidumbre, sensor, origen y aviso de simulado', async () => {
    fixture.componentRef.setInput('event', makeEvent());
    await fixture.whenStable();
    const text = el().textContent ?? '';
    expect(text).toContain('Remoción de suelo');
    expect(text).toContain('12/10/2026 ± 12 días');
    expect(text).toContain('Manual (sin sensor satelital)');
    expect(text).toContain('Estimado');
    expect(text).toContain('Dato simulado para la demostración');
    expect(text).toContain('Sin imagen de evidencia');
    expect(button('Ver radar contra óptico')).toBeUndefined();
  });

  it('muestra confianza y miniatura cuando existen', async () => {
    fixture.componentRef.setInput(
      'event',
      makeEvent({ confidence: 0.7, evidence_image_url: '/media/evidence/a.png' }),
    );
    await fixture.whenStable();
    expect(el().textContent).toContain('70 %');
    expect(el().querySelector('img')?.getAttribute('src')).toBe('/media/evidence/a.png');
    expect(button('Ver radar contra óptico')).toBeDefined();
  });

  it('confirma el evento con PATCH y avisa el cambio de origen', async () => {
    fixture.componentRef.setInput('event', makeEvent());
    let reviewed: EventLogItem | undefined;
    fixture.componentInstance.reviewed.subscribe((event) => (reviewed = event));
    await fixture.whenStable();

    button('Confirmar')?.click();
    const request = http.expectOne('/api/events/1/');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ confirm: true });
    request.flush(makeEvent({ origin: 'DECLARED' }));
    await fixture.whenStable();

    expect(reviewed?.origin).toBe('DECLARED');
    expect(el().textContent).toContain('ahora figura como dato declarado');
  });
});
