import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { DemoAccount } from '../../../core/account/demo-account';
import { LotOutbox } from '../../../core/offline/lot-outbox';
import { KeyValueStorage, OFFLINE_STORAGE } from '../../../core/offline/storage';
import { provideOfflineTesting } from '../../../core/offline/testing';
import { Cell } from '../grid';
import { PaintSession } from '../paint';
import { DRAFT_KEY, LotDraft, LotDraw } from './lot-draw';

// lo interno que usan las pruebas para marcar sin mouse
interface Internals {
  editor: { add(p: [number, number]): void };
  changed(): void;
  paint: PaintSession;
  paintChanged(): void;
}

describe('LotDraw', () => {
  let fixture: ComponentFixture<LotDraw>;
  let http: HttpTestingController;
  let storage: KeyValueStorage;
  const el = () => fixture.nativeElement as HTMLElement;
  const internals = () => fixture.componentInstance as unknown as Internals;
  const saveButton = () => el().querySelector<HTMLButtonElement>('button[type=submit]')!;
  const button = (text: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;

  async function setup(prepare?: (storage: KeyValueStorage) => void): Promise<void> {
    // jsdom no dibuja en canvas: la capa de pintura tiene que tolerar un contexto null
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    TestBed.configureTestingModule({
      imports: [LotDraw],
      providers: [provideRouter([]), provideHttpClientTesting(), provideOfflineTesting()],
    });
    storage = TestBed.inject(OFFLINE_STORAGE);
    prepare?.(storage);
    fixture = TestBed.createComponent(LotDraw);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    http.match('/api/lots/').forEach((req) => req.flush([]));
    await fixture.whenStable();
  }

  async function typeName(value: string): Promise<void> {
    const name = el().querySelector<HTMLInputElement>('input[required]')!;
    name.value = value;
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function traceMode(): Promise<void> {
    button('Trazar perímetro').click();
    await fixture.whenStable();
  }

  function traceTriangle(): void {
    const component = internals();
    for (const p of [
      [-33.05, -61.2],
      [-33.05, -61.19],
      [-33.04, -61.19],
    ] as [number, number][]) {
      component.editor.add(p);
    }
    component.changed();
  }

  // un trazo por tramo: cada tramo pinta la línea de celdas entre sus extremos
  async function paintStroke(...cells: Cell[]): Promise<void> {
    const { paint } = internals();
    paint.beginStroke('paint');
    cells.forEach((cell) => paint.strokeTo(cell));
    paint.endStroke();
    internals().paintChanged();
    await fixture.whenStable();
  }

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  describe('trazar perímetro', () => {
    beforeEach(async () => {
      await setup();
      await traceMode();
    });

    it('pide el nombre y al menos 3 vértices antes de guardar', () => {
      expect(saveButton().disabled).toBe(true);
      expect(el().textContent).toContain('Marcá 3 vértices más');
    });

    it('guarda el polígono como GeoJSON y abre la ficha del lote', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      traceTriangle();
      await typeName('Lote nuevo');

      expect(el().textContent).toContain('Perímetro listo para guardar');
      saveButton().click();

      const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/lots/');
      expect(req.request.body.name).toBe('Lote nuevo');
      expect(req.request.body.renspa).toBeNull();
      expect(req.request.body.geometry.coordinates[0][0]).toEqual([-61.2, -33.05]);
      expect(req.request.body.geometry.coordinates[0].length).toBe(4);
      req.flush({ id: 42, name: 'Lote nuevo' });
      await fixture.whenStable();

      expect(TestBed.inject(DemoAccount).owns(42)).toBe(true);
      expect(el().textContent).toContain('Listo: guardamos «Lote nuevo»');
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/lotes', 42]), {
        timeout: 2500,
      });
      expect(storage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('muestra el error de validación del backend', async () => {
      traceTriangle();
      await typeName('Lote');
      saveButton().click();

      http
        .expectOne((r) => r.method === 'POST')
        .flush(
          { geometry: ['geometry no es un polígono válido (se cruza o no cierra)'] },
          { status: 400, statusText: 'Bad Request' },
        );
      await fixture.whenStable();
      expect(el().querySelector('[role=alert]')?.textContent).toContain('se cruza');
      expect(saveButton().disabled).toBe(false);
    });
  });

  describe('pintar hectáreas', () => {
    it('es el modo por defecto y pide al menos un recuadro', async () => {
      await setup();
      expect(button('Pintar hectáreas').getAttribute('aria-pressed')).toBe('true');
      expect(el().textContent).toContain('Pintá al menos un recuadro');
      await typeName('Lote pintado');
      expect(saveButton().disabled).toBe(true);
    });

    it('pinta recuadros y guarda un Polygon', async () => {
      await setup();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await paintStroke([0, 0], [3, 0]);
      await paintStroke([0, 1], [3, 1]);
      await typeName('QA pintado');

      expect(el().textContent).toContain('8 hectáreas');
      expect(el().textContent).toContain('Un solo sector');
      saveButton().click();

      const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/lots/');
      const { geometry } = req.request.body;
      expect(geometry.type).toBe('Polygon');
      const ring = geometry.coordinates[0] as number[][];
      expect(ring.length).toBeGreaterThanOrEqual(5);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      req.flush({ id: 7, name: 'QA pintado' });
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/lotes', 7]), {
        timeout: 2500,
      });
      expect(TestBed.inject(DemoAccount).owns(7)).toBe(true);
    });

    it('con dos sectores separados no deja guardar hasta unirlos', async () => {
      await setup();
      await paintStroke([0, 0], [2, 0]);
      await paintStroke([6, 6], [7, 6]);
      await typeName('Lote partido');

      expect(el().textContent).toContain('Tus recuadros forman 2 sectores separados');
      expect(saveButton().disabled).toBe(true);

      button('Quedarme con el sector más grande').click();
      await fixture.whenStable();
      expect(el().textContent).toContain('3 hectáreas');
      expect(saveButton().disabled).toBe(false);
    });

    it('restaura el borrador y lo deja descartar', async () => {
      const session = new PaintSession([-33.05, -61.2], {
        rotationDeg: 12,
        cells: [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
      });
      const draft: LotDraft = {
        v: 1,
        mode: 'paint',
        paint: session.snapshot(),
        points: [],
        name: 'Lote borrador',
        locality: 'Casilda',
        province: '',
        renspa: '',
        savedAt: '2026-11-14T10:00:00.000Z',
      };
      await setup((s) => s.setItem(DRAFT_KEY, JSON.stringify(draft)));

      expect(el().querySelector<HTMLInputElement>('input[required]')!.value).toBe('Lote borrador');
      expect(el().textContent).toContain('Retomamos el borrador');
      expect(el().textContent).toContain('3 hectáreas');
      expect(internals().paint.rotationDeg).toBe(12);
      expect(saveButton().disabled).toBe(false);

      button('Descartar borrador').click();
      await fixture.whenStable();
      button('Sí, descartar').click();
      await fixture.whenStable();
      expect(el().querySelector<HTMLInputElement>('input[required]')!.value).toBe('');
      expect(el().textContent).toContain('Pintá al menos un recuadro');
      expect(storage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('guarda el borrador mientras se pinta', async () => {
      await setup();
      await paintStroke([0, 0], [1, 0]);
      await typeName('Lote a medias');
      await vi.waitFor(() => expect(storage.getItem(DRAFT_KEY)).not.toBeNull());
      const saved = JSON.parse(storage.getItem(DRAFT_KEY)!) as LotDraft;
      expect(saved.name).toBe('Lote a medias');
      expect(saved.paint.cells).toEqual([0, 0, 1, 0]);
    });

    it('sin conexión deja el lote en la cola y vuelve al mapa', async () => {
      await setup();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await paintStroke([0, 0], [2, 0]);
      await typeName('Lote sin señal');
      saveButton().click();

      http
        .expectOne((r) => r.method === 'POST' && r.url === '/api/lots/')
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      await fixture.whenStable();

      expect(el().textContent).toContain('Guardamos el lote en este dispositivo');
      expect(TestBed.inject(LotOutbox).pending().length).toBe(1);
      expect(TestBed.inject(DemoAccount).lotIds().size).toBe(0);
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/mapa']), {
        timeout: 3000,
      });
      expect(storage.getItem(DRAFT_KEY)).toBeNull();
    });
  });
});
