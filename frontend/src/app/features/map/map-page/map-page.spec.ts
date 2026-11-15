import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Provider, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';

import { LotSummary } from '../../../core/models';
import { NO_DATA_REASONS } from '../../../core/nasa';
import { provideNasaTesting } from '../../../core/nasa/testing';
import { LotOutbox, PendingLot, SyncedLot } from '../../../core/offline/lot-outbox';
import { provideOfflineTesting } from '../../../core/offline/testing';
import { IsoScene } from '../../../shared/iso/iso-scene';
import { MapPage } from './map-page';

// lotes armados para la prueba: no representan lotes reales
const GEOMETRY: LotSummary['geometry'] = {
  type: 'Polygon',
  coordinates: [
    [
      [-61.2, -33.05],
      [-61.19, -33.05],
      [-61.19, -33.04],
      [-61.2, -33.05],
    ],
  ],
};
const MINE: LotSummary = {
  id: 7,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Pueblo de prueba',
  province: 'Santa Fe',
  geometry: GEOMETRY,
  area_ha: 24.94,
  event_count: 3,
  created_at: '2026-11-14T10:00:00Z',
};
const OTHER: LotSummary = { ...MINE, id: 8, name: 'Lote del bajo', area_ha: 10 };

describe('MapPage', () => {
  let fixture: ComponentFixture<MapPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const buttonWith = (text: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(text),
    );

  async function setup(extra: Provider[] = []): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MapPage],
      providers: [
        provideRouter([]),
        ...provideNasaTesting(),
        provideHttpClientTesting(),
        provideOfflineTesting(),
        ...extra,
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MapPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  }

  async function load(lots: LotSummary[]): Promise<void> {
    http.expectOne('/api/lots/').flush(lots);
    await fixture.whenStable();
    for (const req of http.match((r) => /\/api\/lots\/\d+\/$/.test(r.url))) {
      req.flush({ ...MINE, campaigns: [] });
    }
    for (const req of http.match((r) => /\/events\/$/.test(r.url))) {
      req.flush({ lot: 7, count: 0, message: null, events: [] });
    }
    await fixture.whenStable();
  }

  function fakeGeolocation(result: GeolocationCoordinates | { code: number }): void {
    const geolocation = {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) =>
        'latitude' in result
          ? ok({ coords: result, timestamp: Date.now() } as GeolocationPosition)
          : fail(result as GeolocationPositionError),
    };
    Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation');
    vi.restoreAllMocks();
  });

  it('muestra solo los lotes de la cuenta, con sus totales', async () => {
    await setup();
    await load([MINE, OTHER]);

    const text = el().textContent ?? '';
    expect(text).toContain('Mi campo');
    expect(text).toContain('Lote de prueba');
    expect(text).toContain('Lote del bajo');
    expect(el().querySelector('.totals')?.textContent).toContain('2 lotes');
    expect(el().querySelector('.totals')?.textContent).toContain('34,9 ha');
    expect(text).not.toContain('Ejemplo');
    // una sola acción principal: marcar otro lote
    expect(el().querySelectorAll('.btn--primary').length).toBe(1);
    expect(el().querySelector('a.btn--primary')?.getAttribute('href')).toBe('/mapa/nuevo');
  });

  it('sin lotes da la bienvenida y pregunta si usamos la ubicación, sin maqueta', async () => {
    await setup();
    await load([]);

    const text = el().textContent ?? '';
    expect(text).toContain('Marcá tu primer lote');
    expect(text).toContain('¿Usamos tu ubicación para encontrar tu campo más rápido?');
    expect(text).toContain('No la guardamos.');
    expect(buttonWith('Usar mi ubicación')).toBeTruthy();
    expect(el().querySelector('a[href="/mapa/nuevo"]')?.textContent).toContain('Buscar en el mapa');
    expect(el().querySelector('a[href="/ejemplos"]')?.textContent).toContain(
      'Ver un lote de ejemplo',
    );
    expect(el().querySelector('app-iso-scene')).toBeNull();
  });

  it('con la ubicación abre el alta de lote con el mapa sobre el campo', async () => {
    await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await load([]);
    fakeGeolocation({ latitude: -33.123456, longitude: -61.654321 } as GeolocationCoordinates);

    buttonWith('Usar mi ubicación')!.click();
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(['/mapa/nuevo'], {
        queryParams: { lat: -33.12346, lng: -61.65432 },
      }),
    );
  });

  it('si no hay permiso de ubicación lo dice y deja buscar en el mapa', async () => {
    await setup();
    await load([]);
    fakeGeolocation({ code: 1 });

    buttonWith('Usar mi ubicación')!.click();
    await vi.waitFor(() =>
      expect(el().querySelector('[role=alert]')?.textContent).toContain(
        'No nos diste permiso para ver tu ubicación',
      ),
    );
    expect(el().querySelector('a[href="/mapa/nuevo"]')).toBeTruthy();
  });

  it('tocar un lote de la lista lo elige y lo abre en el popup; el resumen ofrece "Ver lote"', async () => {
    await setup();
    await load([MINE]);

    const button = [...el().querySelectorAll<HTMLButtonElement>('button.lot')].find((item) =>
      item.textContent?.includes('Lote de prueba'),
    );
    // una línea por lote: las hectáreas y la localidad, sin párrafos
    expect(button?.querySelector('.line')?.textContent?.trim()).toBe('24,9 ha · Pueblo de prueba');
    expect(button?.getAttribute('aria-haspopup')).toBe('dialog');
    button?.click();
    await fixture.whenStable();
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(TestBed.inject(Router).url).toBe('/?lote=7');
    expect(el().querySelector('dialog.lot-dialog')?.hasAttribute('open')).toBe(true);

    const summary = el().querySelector('app-lot-summary');
    const open = summary?.querySelector('a[aria-haspopup="dialog"]');
    expect(open?.textContent).toContain('Ver lote');
    expect(open?.getAttribute('href')).toBe('/?lote=7');
    // nombre, hectáreas y una línea de estado: sin párrafos
    expect(summary?.querySelector('.where')?.textContent?.trim()).toBe(
      '24,9 ha · Pueblo de prueba',
    );
    expect(summary?.querySelector('.status')?.textContent).toContain(
      'Sin eventos detectados todavía',
    );
  });

  it('con más de 6 lotes aparecen la búsqueda y el orden', async () => {
    await setup();
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...MINE,
      id: 100 + i,
      name: i === 3 ? 'Lote La Esperanza' : `Lote ${i + 1}`,
    }));
    await load(many);

    const search = el().querySelector<HTMLInputElement>('input[type=search]')!;
    expect(search).toBeTruthy();
    expect(el().querySelector('select')).toBeTruthy();
    search.value = 'esperanza';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el().querySelectorAll('button.lot').length).toBe(1);
    expect(el().textContent).toContain('Mostrando 1 de 8');
  });

  it('si la NASA no responde, la capa NDVI lo dice y no raya los lotes como nublados', async () => {
    await setup();
    await load([MINE]);

    const ndviButton = [...el().querySelectorAll<HTMLButtonElement>('.hud__btn')].find((item) =>
      item.textContent?.includes('NDVI'),
    );
    ndviButton?.click();
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fixture.whenStable();
    }

    expect(el().querySelector('.ndvi-legend')?.textContent).toContain(NO_DATA_REASONS.offline);
    const scene = fixture.debugElement.query(By.directive(IsoScene)).componentInstance as IsoScene;
    expect(scene.lots().some((lot) => lot.hatched)).toBe(false);
  });

  it('no vuelve a pedir la lista al abrir la pantalla si la cola ya había subido lotes', async () => {
    const outbox = {
      pending: signal<PendingLot[]>([]),
      lastSynced: signal<SyncedLot[]>([{ localId: 'a', lot: { ...MINE, campaigns: [] } }]),
    };
    await setup([{ provide: LotOutbox, useValue: outbox }]);
    expect(http.match('/api/lots/').length).toBe(1);
  });

  it('avisa si no se pudieron cargar los lotes', async () => {
    await setup();
    http.expectOne('/api/lots/').flush('error', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(el().querySelector('[role=alert]')?.textContent).toContain('No se pudieron cargar');
  });

  it('sin la lista de lotes no muestra totales en cero ni la bienvenida', async () => {
    await setup();
    http.expectOne('/api/lots/').error(new ProgressEvent('error'));
    await fixture.whenStable();

    expect(el().querySelector('.totals')).toBeNull();
    expect(el().textContent).not.toContain('Marcá tu primer lote');
    expect(el().querySelector('[role=alert]')?.textContent).toContain('Reintentar');
  });
});
