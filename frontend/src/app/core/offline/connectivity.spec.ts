import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Connectivity } from './connectivity';

const HEALTH_URL = '/api/health/';
const HEALTHY = { status: 'ok', database: 'ok' };

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('Connectivity', () => {
  let connectivity: Connectivity;
  let http: HttpTestingController;

  const answerHealthy = (): void => http.expectOne(HEALTH_URL).flush(HEALTHY);
  const answerFailure = (status = 0): void => {
    const request = http.expectOne(HEALTH_URL);
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush(null, { status, statusText: 'Error' });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    connectivity = TestBed.inject(Connectivity);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // al destruir el servicio no puede quedar ningún timer vivo
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (document as { visibilityState?: string }).visibilityState;
  });

  it('no pide nada hasta que se llama a start()', () => {
    http.expectNone(HEALTH_URL);
    expect(connectivity.backend()).toBe('checking');
    expect(connectivity.label()).toBe('Connecting…');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('chequea health al iniciar y queda en "up" si responde', () => {
    connectivity.start();
    expect(connectivity.backend()).toBe('checking');

    answerHealthy();

    expect(connectivity.backend()).toBe('up');
    expect(connectivity.label()).toBe('Online');
    expect(connectivity.reconnectCount()).toBe(0);
  });

  it('start() repetido no duplica el chequeo', () => {
    connectivity.start();
    connectivity.start();

    answerHealthy();
    http.expectNone(HEALTH_URL);
  });

  it.each([0, 500, 502, 503, 504])('queda en "down" si health falla con %i', (status) => {
    connectivity.start();

    answerFailure(status);

    expect(connectivity.backend()).toBe('down');
    expect(connectivity.label()).toBe('Offline: server unreachable');
  });

  it('da por caído un health que no responde en 10 segundos', () => {
    connectivity.start();
    const request = http.expectOne(HEALTH_URL);

    vi.advanceTimersByTime(9_999);
    expect(connectivity.backend()).toBe('checking');
    vi.advanceTimersByTime(1);

    expect(connectivity.backend()).toBe('down');
    expect(request.cancelled).toBe(true);
  });

  it('mientras está caído reintenta con espera creciente, hasta un tope de 30 segundos', () => {
    connectivity.start();
    answerFailure();

    for (const wait of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      vi.advanceTimersByTime(wait - 1);
      http.expectNone(HEALTH_URL);
      vi.advanceTimersByTime(1);
      answerFailure();
      expect(connectivity.backend()).toBe('down');
    }
  });

  it('al volver a "up" corta los reintentos y cuenta la reconexión', () => {
    connectivity.start();
    answerFailure();
    vi.advanceTimersByTime(2_000);

    answerHealthy();

    expect(connectivity.backend()).toBe('up');
    expect(connectivity.reconnectCount()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    http.expectNone(HEALTH_URL);
  });

  it('después de recuperarse, la espera vuelve a empezar de 2 segundos', () => {
    connectivity.start();
    answerFailure();
    vi.advanceTimersByTime(2_000);
    answerFailure();
    vi.advanceTimersByTime(4_000);
    answerHealthy();

    connectivity.noteFailure();
    answerFailure();
    vi.advanceTimersByTime(1_999);
    http.expectNone(HEALTH_URL);
    vi.advanceTimersByTime(1);

    answerFailure();
  });

  it('con la pestaña oculta no reintenta, y al volver chequea enseguida', () => {
    connectivity.start();
    answerFailure();
    expect(vi.getTimerCount()).toBe(1);

    setVisibility('hidden');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    http.expectNone(HEALTH_URL);

    setVisibility('visible');
    answerHealthy();
    expect(connectivity.backend()).toBe('up');
  });

  it('si la falla llega con la pestaña oculta, no programa el reintento', () => {
    connectivity.start();
    setVisibility('hidden');

    answerFailure();

    expect(connectivity.backend()).toBe('down');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('volver a la pestaña con el backend arriba no chequea de nuevo', () => {
    connectivity.start();
    answerHealthy();

    setVisibility('hidden');
    setVisibility('visible');

    http.expectNone(HEALTH_URL);
  });

  it('toma el estado inicial de navigator.onLine', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });

    expect(TestBed.inject(Connectivity).online()).toBe(false);
  });

  it('sigue los eventos offline y online, y chequea el backend en cada cambio', () => {
    connectivity.start();
    answerHealthy();
    expect(connectivity.online()).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(connectivity.online()).toBe(false);
    // hasta que health no falle no se da por caído: en localhost el backend sigue ahí
    expect(connectivity.backend()).toBe('up');
    answerFailure();
    expect(connectivity.backend()).toBe('down');
    expect(connectivity.label()).toBe('Offline: no internet');

    window.dispatchEvent(new Event('online'));
    expect(connectivity.online()).toBe(true);
    answerHealthy();
    expect(connectivity.backend()).toBe('up');
    expect(connectivity.reconnectCount()).toBe(1);
  });

  it('recheck() devuelve el resultado y no duplica un chequeo en curso', async () => {
    connectivity.start();
    answerFailure();

    const first = connectivity.recheck();
    const second = connectivity.recheck();
    expect(connectivity.backend()).toBe('down');
    answerHealthy();

    await expect(first).resolves.toBe('up');
    await expect(second).resolves.toBe('up');
    http.expectNone(HEALTH_URL);
  });

  it('recheck() cancela el reintento programado', () => {
    connectivity.start();
    answerFailure();

    void connectivity.recheck();
    answerFailure();

    // queda un solo timer: el del nuevo reintento
    expect(vi.getTimerCount()).toBe(1);
  });

  describe('datos guardados', () => {
    const SAVED = new Date('2026-11-14T16:20:00Z');

    it('marca cuándo se sirvió una copia y de cuándo es la más vieja', () => {
      vi.setSystemTime(new Date('2026-11-15T09:00:00Z'));

      connectivity.noteCacheServed(SAVED);
      connectivity.noteCacheServed(new Date('2026-11-14T18:00:00Z'));

      expect(connectivity.cacheServedAt()).toEqual(new Date('2026-11-15T09:00:00Z'));
      expect(connectivity.cacheSavedAt()).toEqual(SAVED);
    });

    it('una lectura que llega de la red los vuelve a null', () => {
      connectivity.noteCacheServed(SAVED);

      connectivity.noteNetworkRead();

      expect(connectivity.cacheServedAt()).toBeNull();
      expect(connectivity.cacheSavedAt()).toBeNull();
    });

    it('con el backend caído el texto avisa que se muestran datos guardados', () => {
      connectivity.start();
      answerFailure();

      connectivity.noteCacheServed(SAVED);

      expect(connectivity.label()).toBe('Offline: server unreachable · showing saved data');
    });

    it('sin internet el texto lo dice y avisa que se muestran datos guardados', () => {
      connectivity.start();
      window.dispatchEvent(new Event('offline'));
      answerFailure();

      connectivity.noteCacheServed(SAVED);

      expect(connectivity.label()).toBe('Offline: no internet · showing saved data');
    });

    it('con el backend de vuelta sigue avisando hasta que llega una lectura de la red', () => {
      connectivity.start();
      answerFailure();
      connectivity.noteCacheServed(SAVED);
      vi.advanceTimersByTime(2_000);
      answerHealthy();

      expect(connectivity.label()).toBe('Online · showing saved data');

      connectivity.noteNetworkRead();
      expect(connectivity.label()).toBe('Online');
    });
  });

  describe('avisos del interceptor y de la cola', () => {
    it('una falla con el backend arriba pasa a "checking" y la confirma con health', () => {
      connectivity.start();
      answerHealthy();

      connectivity.noteFailure();
      expect(connectivity.backend()).toBe('checking');

      // fue un tropiezo de ese pedido: no cuenta como reconexión
      answerHealthy();
      expect(connectivity.backend()).toBe('up');
      expect(connectivity.reconnectCount()).toBe(0);
    });

    it('si health confirma la falla queda en "down" y empieza a reintentar', () => {
      connectivity.start();
      answerHealthy();

      connectivity.noteFailure();
      answerFailure(502);

      expect(connectivity.backend()).toBe('down');
      expect(vi.getTimerCount()).toBe(1);
    });

    it('varias fallas juntas disparan un solo chequeo', () => {
      connectivity.start();
      answerHealthy();

      connectivity.noteFailure();
      connectivity.noteFailure();
      connectivity.noteCacheServed(new Date());

      answerFailure();
      http.expectNone(HEALTH_URL);
    });

    it('una respuesta del backend lo da por levantado sin esperar el reintento', () => {
      connectivity.start();
      answerFailure();

      connectivity.noteSuccess();

      expect(connectivity.backend()).toBe('up');
      expect(connectivity.reconnectCount()).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('sin start() los avisos no cambian el estado del backend ni piden nada', () => {
      connectivity.noteFailure();
      connectivity.noteSuccess();
      connectivity.noteNetworkRead();
      connectivity.noteCacheServed(new Date());

      expect(connectivity.backend()).toBe('checking');
      http.expectNone(HEALTH_URL);
    });
  });

  it('al destruirse deja de escuchar y cancela el chequeo en curso', async () => {
    connectivity.start();
    const request = http.expectOne(HEALTH_URL);
    const pending = connectivity.recheck();

    TestBed.resetTestingModule();

    expect(request.cancelled).toBe(true);
    await expect(pending).resolves.toBe('checking');
    window.dispatchEvent(new Event('online'));
    setVisibility('visible');
    expect(vi.getTimerCount()).toBe(0);
  });
});
