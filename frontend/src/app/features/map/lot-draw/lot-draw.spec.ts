import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import type * as L from 'leaflet';

import { LotOutbox } from '../../../core/offline/lot-outbox';
import { KeyValueStorage, OFFLINE_STORAGE } from '../../../core/offline/storage';
import { provideOfflineTesting } from '../../../core/offline/testing';
import { Cell } from '../grid';
import { PaintSession } from '../paint';
import { DRAFT_KEY, FIELD_ZOOM, LotDraft, LotDraw } from './lot-draw';
import { NOMINATIM_SEARCH } from './place-search';

// lo interno que usan las pruebas para marcar sin mouse
interface Internals {
  editor: { add(p: [number, number]): void };
  changed(): void;
  paint: PaintSession;
  paintChanged(): void;
  map: L.Map | null;
}

// respuesta armada con la forma de Nominatim: no es una consulta real
const NOMINATIM_ROWS = [
  {
    place_id: 1,
    name: 'Pueblo de Prueba',
    display_name: 'Pueblo de Prueba, Departamento Uno, Santa Fe, S2170, Argentina',
    lat: '-33.0440',
    lon: '-61.1680',
    boundingbox: ['-33.06', '-33.03', '-61.19', '-61.15'],
  },
];

describe('LotDraw', () => {
  let fixture: ComponentFixture<LotDraw>;
  let http: HttpTestingController;
  let storage: KeyValueStorage;
  const el = () => fixture.nativeElement as HTMLElement;
  const internals = () => fixture.componentInstance as unknown as Internals;
  const saveButton = () =>
    el().querySelector<HTMLButtonElement>('button[type=submit].btn--primary')!;
  const button = (text: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
  const hint = () => el().querySelector('.hint')?.textContent?.trim() ?? '';

  async function setup(
    prepare?: (storage: KeyValueStorage) => void,
    extra: Provider[] = [],
  ): Promise<void> {
    // jsdom no dibuja en canvas: la capa de pintura tiene que tolerar un contexto null
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    TestBed.configureTestingModule({
      imports: [LotDraw],
      providers: [provideRouter([]), provideHttpClientTesting(), provideOfflineTesting(), ...extra],
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
    const name = el().querySelector<HTMLInputElement>('input[name=name]')!;
    name.value = value;
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function trace(...points: [number, number][]): Promise<void> {
    const component = internals();
    for (const p of points) component.editor.add(p);
    component.changed();
    await fixture.whenStable();
  }

  const TRIANGLE: [number, number][] = [
    [-33.05, -61.2],
    [-33.05, -61.19],
    [-33.04, -61.19],
  ];

  // un trazo por tramo: cada tramo pinta la línea de celdas entre sus extremos
  async function paintStroke(...cells: Cell[]): Promise<void> {
    const { paint } = internals();
    paint.beginStroke('paint');
    cells.forEach((cell) => paint.strokeTo(cell));
    paint.endStroke();
    internals().paintChanged();
    await fixture.whenStable();
  }

  async function paintMode(): Promise<void> {
    button('Pintar hectáreas').click();
    await fixture.whenStable();
  }

  afterEach(() => {
    http.verify();
    Reflect.deleteProperty(navigator, 'onLine');
    vi.restoreAllMocks();
  });

  describe('trazar perímetro (modo de entrada)', () => {
    it('arranca trazando en la región pampeana, sin poder guardar y sin lo avanzado a la vista', async () => {
      await setup();

      expect(hint()).toContain('Buscá tu campo arriba o acercate al mapa');
      expect(el().textContent).toContain('Tocá 3 esquinas más para cerrar la forma');
      expect(saveButton().disabled).toBe(true);
      // en el mapa solo hay dos correcciones
      const tools = [...el().querySelectorAll('.tools button')].map((b) => b.textContent?.trim());
      expect(tools).toEqual(['Deshacer', 'Empezar de nuevo']);
      // pintar y el ajuste fino quedan plegados en "Opciones avanzadas"
      const paint = button('Pintar hectáreas');
      expect(paint.getAttribute('aria-pressed')).toBe('false');
      expect(paint.closest('details')?.open).toBe(false);
      expect(el().querySelector('app-paint-hud')).toBeNull();
    });

    it('con lat y lng en la dirección arranca ahí con zoom de campo', async () => {
      const route = {
        snapshot: { queryParamMap: convertToParamMap({ lat: '-33.1', lng: '-61.2' }) },
      };
      await setup(undefined, [{ provide: ActivatedRoute, useValue: route }]);

      const map = internals().map!;
      expect(map.getZoom()).toBe(FIELD_ZOOM);
      expect(map.getCenter().lat).toBeCloseTo(-33.1, 5);
      expect(map.getCenter().lng).toBeCloseTo(-61.2, 5);
      expect(hint()).toContain('Tocá las esquinas de tu lote');
      expect(el().querySelector('.me-dot')).toBeTruthy();
    });

    it('revisa la forma al cerrarla y guarda con el nombre sugerido', async () => {
      await setup();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await trace(...TRIANGLE);

      const checks = el().querySelector('.checks')?.textContent ?? '';
      expect(checks).toContain('Forma cerrada: 3 esquinas');
      expect(checks).toContain('Sin cruces');
      expect(checks).toMatch(/Superficie: 5\d,\d ha/);
      expect(hint()).toContain('Listo: ya podés guardar');
      expect(el().textContent).toContain('se guarda como «Lote 1»');
      expect(saveButton().disabled).toBe(false);
      saveButton().click();

      const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/lots/');
      expect(req.request.body.name).toBe('Lote 1');
      expect(req.request.body.renspa).toBeNull();
      expect(req.request.body.geometry.coordinates[0][0]).toEqual([-61.2, -33.05]);
      expect(req.request.body.geometry.coordinates[0].length).toBe(4);
      req.flush({ id: 42, name: 'Lote 1' });
      await fixture.whenStable();

      expect(el().textContent).toContain('Listo: guardamos «Lote 1»');
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/lotes', 42]), {
        timeout: 2500,
      });
      expect(storage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('no deja guardar un perímetro que se cruza', async () => {
      await setup();
      // las esquinas de un rectángulo en orden cruzado forman un moño
      await trace([-33.05, -61.2], [-33.04, -61.19], [-33.05, -61.19], [-33.04, -61.2]);

      expect(el().querySelector('.checks')?.textContent).toContain('Los lados se cruzan');
      expect(hint()).toContain('Los lados se cruzan');
      expect(saveButton().disabled).toBe(true);
    });

    it('muestra el error de validación del backend con el nombre que escribió', async () => {
      await setup();
      await trace(...TRIANGLE);
      await typeName('Lote del fondo');
      saveButton().click();

      const req = http.expectOne((r) => r.method === 'POST');
      expect(req.request.body.name).toBe('Lote del fondo');
      req.flush(
        { geometry: ['geometry no es un polígono válido (se cruza o no cierra)'] },
        { status: 400, statusText: 'Bad Request' },
      );
      await fixture.whenStable();
      expect(el().querySelector('[role=alert]')?.textContent).toContain('se cruza');
      expect(saveButton().disabled).toBe(false);
    });
  });

  describe('buscador de lugares', () => {
    async function search(text: string): Promise<void> {
      const input = el().querySelector<HTMLInputElement>('app-place-search input[type=search]')!;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    it('consulta Nominatim solo al apretar Buscar y muestra la atribución', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => NOMINATIM_ROWS,
      } as Response);
      await setup();

      await search('Pueblo de Prueba');
      expect(fetch).not.toHaveBeenCalled();

      button('Buscar').click();
      await vi.waitFor(() => expect(el().querySelector('.results')).toBeTruthy());
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0][0])).toBe(
        `${NOMINATIM_SEARCH}?format=jsonv2&countrycodes=ar&limit=5&q=Pueblo%20de%20Prueba`,
      );
      const results = el().querySelector('.results')!.textContent ?? '';
      expect(results).toContain('Pueblo de Prueba');
      expect(results).toContain('Departamento Uno, Santa Fe');
      expect(results).toContain('© colaboradores de OpenStreetMap');

      button('Departamento Uno').click();
      await fixture.whenStable();
      expect(el().querySelector('.results')).toBeNull();
    });

    it('sin conexión lo dice y no consulta', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      await setup();
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      await search('Pueblo de Prueba');
      button('Buscar').click();
      await vi.waitFor(() =>
        expect(el().querySelector('.results [role=alert]')?.textContent).toContain(
          'Sin conexión no podemos buscar lugares',
        ),
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('pintar hectáreas (opción avanzada)', () => {
    it('se elige en Opciones avanzadas y pide al menos un recuadro', async () => {
      await setup();
      await paintMode();
      expect(button('Pintar hectáreas').getAttribute('aria-pressed')).toBe('true');
      expect(el().querySelector('app-paint-hud')).toBeTruthy();
      expect(el().textContent).toContain('Pintá al menos un recuadro');
      expect(saveButton().disabled).toBe(true);
    });

    it('pinta recuadros y guarda un Polygon', async () => {
      await setup();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await paintMode();
      await paintStroke([0, 0], [3, 0]);
      await paintStroke([0, 1], [3, 1]);
      await typeName('QA pintado');

      const checks = el().querySelector('.checks')?.textContent ?? '';
      expect(checks).toContain('Un solo sector');
      expect(checks).toContain('Superficie: 8 ha');
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
    });

    it('con dos sectores separados no deja guardar hasta unirlos', async () => {
      await setup();
      await paintMode();
      await paintStroke([0, 0], [2, 0]);
      await paintStroke([6, 6], [7, 6]);

      expect(el().textContent).toContain('Tus recuadros forman 2 sectores separados');
      expect(saveButton().disabled).toBe(true);

      button('Quedarme con el sector más grande').click();
      await fixture.whenStable();
      expect(el().querySelector('.checks')?.textContent).toContain('Superficie: 3 ha');
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
        locality: 'Pueblo de prueba',
        province: '',
        renspa: '',
        savedAt: '2026-11-14T10:00:00.000Z',
      };
      await setup((s) => s.setItem(DRAFT_KEY, JSON.stringify(draft)));

      expect(el().querySelector<HTMLInputElement>('input[name=name]')!.value).toBe('Lote borrador');
      expect(el().textContent).toContain('Retomamos el lote que dejaste a medias');
      expect(el().querySelector('.checks')?.textContent).toContain('Superficie: 3 ha');
      expect(internals().paint.rotationDeg).toBe(12);
      expect(saveButton().disabled).toBe(false);

      button('Descartar').click();
      await fixture.whenStable();
      button('Sí, descartar').click();
      await fixture.whenStable();
      expect(el().querySelector<HTMLInputElement>('input[name=name]')!.value).toBe('');
      expect(el().textContent).toContain('Pintá al menos un recuadro');
      expect(storage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('guarda el borrador mientras se pinta', async () => {
      await setup();
      await paintMode();
      await paintStroke([0, 0], [1, 0]);
      await typeName('Lote a medias');
      await vi.waitFor(() => expect(storage.getItem(DRAFT_KEY)).not.toBeNull());
      const saved = JSON.parse(storage.getItem(DRAFT_KEY)!) as LotDraft;
      expect(saved.name).toBe('Lote a medias');
      expect(saved.mode).toBe('paint');
      expect(saved.paint.cells).toEqual([0, 0, 1, 0]);
    });

    it('sin conexión deja el lote en la cola y vuelve a Mi campo', async () => {
      await setup();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await paintMode();
      await paintStroke([0, 0], [2, 0]);
      await typeName('Lote sin señal');
      saveButton().click();

      http
        .expectOne((r) => r.method === 'POST' && r.url === '/api/lots/')
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      await fixture.whenStable();

      expect(el().textContent).toContain('Guardamos el lote en este dispositivo');
      expect(TestBed.inject(LotOutbox).pending().length).toBe(1);
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/mapa']), {
        timeout: 3000,
      });
      expect(storage.getItem(DRAFT_KEY)).toBeNull();
    });
  });
});
