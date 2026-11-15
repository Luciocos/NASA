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

  const lotCards = () => [...el().querySelectorAll<HTMLButtonElement>('button.lot__pick')];
  const hudLinks = () => [...el().querySelectorAll<HTMLAnchorElement>('.stage__lot a.hud__btn')];

  it('sin encabezado de página: la maqueta y "Tus lotes" con la cantidad y las hectáreas', async () => {
    await setup();
    await load([MINE, OTHER]);

    const text = el().textContent ?? '';
    expect(text).toContain('Lote de prueba');
    expect(text).toContain('Lote del bajo');
    // sin título, bajada ni totales a la vista: el h1 queda solo para el lector de pantalla
    expect(el().querySelector('app-page-header')).toBeNull();
    expect(el().querySelector('h1')?.classList).toContain('visually-hidden');
    expect(text).not.toContain('Tus lotes y lo que ven');
    expect(el().querySelector('#stage-title')?.classList).toContain('visually-hidden');
    expect(el().querySelector('app-lot-list .subtitle')?.textContent?.trim()).toBe(
      '2 lotes · 34,9 ha',
    );
    // "Marcar lote" ya está en la barra de arriba y en las pestañas del celular
    expect(el().querySelector('.btn--primary')).toBeNull();
    expect(el().querySelector('.seg')?.textContent).toContain('Maqueta');
    // cómo leer la maqueta, detrás de un (i)
    expect(el().querySelector('app-info-tip button')?.getAttribute('aria-label')).toBe(
      'Cómo leer la maqueta',
    );
    expect(text).not.toContain('Ejemplo');
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

  it('tocar la tarjeta marca el lote sin abrir nada; la lupa lo abre en el popup', async () => {
    await setup();
    await load([MINE]);
    const router = TestBed.inject(Router);

    const card = lotCards().find((item) => item.textContent?.includes('Lote de prueba'))!;
    // tarjeta compacta: nombre, hectáreas y una línea de estado, sin párrafos
    expect(card.querySelector('.line')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '24,9 ha · Sin eventos todavía',
    );
    expect(card.hasAttribute('aria-haspopup')).toBe(false);
    card.click();
    await fixture.whenStable();
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(router.url).toBe('/');
    // nada de recuadro grande con el resumen
    expect(el().querySelector('app-lot-summary')).toBeNull();
    expect(el().querySelector('dialog.lot-dialog')?.hasAttribute('open')).toBe(false);
    const scene = fixture.debugElement.query(By.directive(IsoScene)).componentInstance as IsoScene;
    expect(scene.selectedId()).toBe('7');

    const lens = el().querySelector<HTMLAnchorElement>('a.lot__open')!;
    expect(lens.getAttribute('aria-label')).toBe('Ver Lote de prueba');
    expect(lens.getAttribute('aria-haspopup')).toBe('dialog');
    expect(lens.getAttribute('href')).toBe('/?lote=7');
    lens.click();
    await fixture.whenStable();
    expect(router.url).toBe('/?lote=7');
    expect(el().querySelector('dialog.lot-dialog')?.hasAttribute('open')).toBe(true);
    expect(card.getAttribute('aria-pressed')).toBe('true');
  });

  it('tocar de nuevo la tarjeta marcada la desmarca', async () => {
    await setup();
    await load([MINE, OTHER]);

    const card = lotCards().find((item) => item.textContent?.includes('Lote del bajo'))!;
    card.click();
    await fixture.whenStable();
    expect(card.getAttribute('aria-pressed')).toBe('true');
    card.click();
    await fixture.whenStable();
    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(el().querySelector('.stage__lot')).toBeNull();
  });

  it('con un lote marcado, la barra de la maqueta suma accesos a las pestañas de su popup', async () => {
    await setup();
    await load([MINE, OTHER]);
    // sin lote elegido no hay accesos (nada de botones apagados)
    expect(el().querySelector('.stage__lot')).toBeNull();

    // elegirlo en la maqueta lo marca también en la lista
    const scene = fixture.debugElement.query(By.directive(IsoScene)).componentInstance as IsoScene;
    scene.lotSelect.emit('8');
    await fixture.whenStable();
    const card = lotCards().find((item) => item.textContent?.includes('Lote del bajo'))!;
    expect(card.getAttribute('aria-pressed')).toBe('true');

    const group = el().querySelector('.stage__lot')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Secciones de Lote del bajo');
    expect(hudLinks().map((link) => link.textContent?.trim())).toEqual([
      'Datos',
      'Huella',
      'Fertilización',
      'Rentabilidad',
    ]);
    expect(hudLinks().map((link) => link.getAttribute('aria-label'))).toEqual([
      'Abrir los datos de Lote del bajo',
      'Abrir la huella de Lote del bajo',
      'Abrir la fertilización de Lote del bajo',
      'Abrir la rentabilidad de Lote del bajo',
    ]);
    // la misma dirección que usa el popup para abrir en esa pestaña
    expect(hudLinks().map((link) => link.getAttribute('href'))).toEqual([
      '/?lote=8',
      '/?lote=8&seccion=huella',
      '/?lote=8&seccion=fertilizacion',
      '/?lote=8&seccion=rentabilidad',
    ]);
    // el resto, en "Más"
    const more = [...el().querySelectorAll<HTMLAnchorElement>('app-more-menu a.menu-item')];
    expect(
      more.map((link) => [link.getAttribute('aria-label'), link.getAttribute('href')]),
    ).toEqual([
      ['Abrir la bitácora de Lote del bajo', '/?lote=8&seccion=bitacora'],
      ['Abrir las prácticas de Lote del bajo', '/?lote=8&seccion=practicas'],
    ]);

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    hudLinks()[2].click();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { lote: 8, seccion: 'fertilizacion', vista: null },
        state: { lotDialog: true },
      }),
    );
  });

  it('un enlace pegado con ?lote= abre el popup y deja ese lote marcado detrás', async () => {
    await setup();
    await TestBed.inject(Router).navigateByUrl('/?lote=8&seccion=huella');
    await load([MINE, OTHER]);

    expect(el().querySelector('dialog.lot-dialog')?.hasAttribute('open')).toBe(true);
    const card = lotCards().find((item) => item.textContent?.includes('Lote del bajo'))!;
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(el().querySelector('.stage__lot')?.getAttribute('aria-label')).toBe(
      'Secciones de Lote del bajo',
    );
  });

  it('un lote sin sincronizar se marca pero no tiene lupa ni accesos al popup', async () => {
    const pending: PendingLot = {
      localId: 'a1',
      body: { name: 'Lote nuevo', geometry: GEOMETRY },
      createdAt: '2026-11-15T10:00:00Z',
      attempts: 1,
      rejected: true,
      error: 'El perímetro se cruza.',
    };
    const outbox = {
      pending: signal<PendingLot[]>([pending]),
      lastSynced: signal<SyncedLot[]>([]),
    };
    await setup([{ provide: LotOutbox, useValue: outbox }]);
    await load([MINE]);

    expect(el().querySelector('app-lot-list .subtitle')?.textContent?.trim()).toBe(
      '1 lote · 24,9 ha · 1 sin sincronizar',
    );
    const card = lotCards().find((item) => item.textContent?.includes('Lote nuevo'))!;
    expect(card.textContent).toContain('Rechazado');
    expect(card.textContent).toContain('El perímetro se cruza.');
    expect(card.closest('li')?.querySelector('a.lot__open')).toBeNull();
    card.click();
    await fixture.whenStable();
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(el().querySelector('.stage__lot')).toBeNull();
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
    expect(lotCards().length).toBe(1);
    expect(el().textContent).toContain('Mostrando 1 de 8');
  });

  it('el orden tiene nombre y pone primero el lote con más hectáreas', async () => {
    await setup();
    const many = Array.from({ length: 7 }, (_, i) => ({
      ...MINE,
      id: 200 + i,
      name: `Lote ${i + 1}`,
      area_ha: i === 4 ? 90 : 10 + i,
    }));
    await load(many);

    const select = el().querySelector<HTMLSelectElement>('app-lot-list select')!;
    expect(select.closest('label')?.textContent).toContain('Ordenar lotes');
    expect([...select.options].map((option) => option.textContent?.trim())).toEqual([
      'Nombre',
      'Hectáreas',
      'Último dato',
    ]);
    select.value = 'area';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(lotCards()[0].querySelector('.name')?.textContent).toBe('Lote 5');
  });

  it('si la NASA no responde, la capa NDVI lo dice y no raya los lotes como nublados', async () => {
    await setup();
    await load([MINE]);

    const ndviButton = [...el().querySelectorAll<HTMLButtonElement>('button.hud__btn')].find(
      (item) => item.textContent?.includes('NDVI'),
    );
    ndviButton?.click();
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fixture.whenStable();
    }

    expect(el().querySelector('.ndvi-legend')?.textContent).toContain(NO_DATA_REASONS.offline);
    // sin ningún NDVI no hay dato que etiquetar: la escala no lleva VERIFICADO
    expect(el().querySelector('.ndvi-legend app-origin-badge')).toBeNull();
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

    expect(el().querySelector('app-lot-list')).toBeNull();
    expect(el().textContent).not.toContain('0 lotes');
    expect(el().textContent).not.toContain('Marcá tu primer lote');
    expect(el().querySelector('[role=alert]')?.textContent).toContain('Reintentar');
  });
});
