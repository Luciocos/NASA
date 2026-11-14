import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { LotDraw } from './lot-draw';

describe('LotDraw', () => {
  let fixture: ComponentFixture<LotDraw>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const saveButton = () => el().querySelector<HTMLButtonElement>('button[type=submit]')!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LotDraw],
      providers: [provideRouter([]), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(LotDraw);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    http.match('/api/lots/').forEach((req) => req.flush([]));
  });

  afterEach(() => http.verify());

  it('pide el nombre y al menos 3 vértices antes de guardar', async () => {
    expect(saveButton().disabled).toBe(true);
    expect(el().textContent).toContain('Marcá 3 vértices más');
  });

  it('guarda el polígono como GeoJSON y abre la ficha del lote', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const component = fixture.componentInstance as unknown as {
      editor: { add(p: [number, number]): void };
      changed(): void;
    };
    component.editor.add([-33.05, -61.2]);
    component.editor.add([-33.05, -61.19]);
    component.editor.add([-33.04, -61.19]);
    component.changed();
    const name = el().querySelector<HTMLInputElement>('input[required]')!;
    name.value = 'Lote nuevo';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(el().textContent).toContain('Perímetro listo para guardar');
    saveButton().click();

    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/lots/');
    expect(req.request.body.name).toBe('Lote nuevo');
    expect(req.request.body.geometry.coordinates[0][0]).toEqual([-61.2, -33.05]);
    expect(req.request.body.geometry.coordinates[0].length).toBe(4);
    req.flush({ id: 42 });
    expect(navigate).toHaveBeenCalledWith(['/lotes', 42]);
  });

  it('muestra el error de validación del backend', async () => {
    const component = fixture.componentInstance as unknown as {
      editor: { add(p: [number, number]): void };
      changed(): void;
    };
    for (const p of [
      [-33.05, -61.2],
      [-33.05, -61.19],
      [-33.04, -61.19],
    ] as [number, number][]) {
      component.editor.add(p);
    }
    component.changed();
    const name = el().querySelector<HTMLInputElement>('input[required]')!;
    name.value = 'Lote';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    saveButton().click();

    http
      .expectOne((r) => r.method === 'POST')
      .flush(
        { geometry: ['geometry no es un polígono válido (se cruza o no cierra)'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    expect(el().querySelector('[role=alert]')?.textContent).toContain('se cruza');
  });
});
