import { DOCUMENT, DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { Subscription, timeout } from 'rxjs';

import { Api } from '../api';

/** estado del backend visto desde esta pestaña */
export type BackendStatus = 'checking' | 'up' | 'down';

// con señal mala un pedido puede quedar colgado minutos: pasado este tiempo se da por caído
const HEALTH_TIMEOUT_MS = 10_000;
const RETRY_FIRST_MS = 2_000;
const RETRY_MAX_MS = 30_000;

interface HealthCheck {
  result: Promise<BackendStatus>;
  settle: (status: BackendStatus) => void;
  request: Subscription | null;
}

/**
 * estado de la conexión: si el navegador tiene red, si el backend responde y si lo que se ve
 * en pantalla salió de la copia guardada
 *
 * no hace nada hasta que se llama a `start()`: lo hace `provideOffline()` al iniciar la app,
 * así los specs que la inyectan no disparan pedidos ni timers por su cuenta
 */
@Service()
export class Connectivity {
  private readonly api = inject(Api);
  private readonly document = inject(DOCUMENT);

  private readonly onlineState = signal(this.document.defaultView?.navigator.onLine ?? true);
  private readonly backendState = signal<BackendStatus>('checking');
  private readonly cacheServedAtState = signal<Date | null>(null);
  private readonly cacheSavedAtState = signal<Date | null>(null);
  private readonly reconnectCountState = signal(0);

  /** lo que informa el navegador (`navigator.onLine`). true no garantiza que haya internet */
  readonly online = this.onlineState.asReadonly();

  /**
   * si el backend responde: 'checking' hasta tener la primera respuesta de `/api/health/`
   * (y mientras se confirma una falla), después 'up' o 'down'
   */
  readonly backend = this.backendState.asReadonly();

  /**
   * última vez que una lectura se resolvió con la copia guardada
   * vuelve a null cuando una lectura llega de la red
   */
  readonly cacheServedAt = this.cacheServedAtState.asReadonly();

  /** de cuándo es la copia más vieja que se mostró desde la última lectura con red */
  readonly cacheSavedAt = this.cacheSavedAtState.asReadonly();

  /**
   * suma uno cada vez que el backend vuelve después de estar caído
   * una pantalla que lo lee dentro de su effect de carga vuelve a pedir sus datos al reconectar
   */
  readonly reconnectCount = this.reconnectCountState.asReadonly();

  /** texto de estado para el encabezado */
  readonly label = computed(() => {
    const backend = this.backendState();
    if (backend === 'checking') return 'Connecting…';
    const state =
      backend === 'up'
        ? 'Online'
        : this.onlineState()
          ? 'Offline: server unreachable'
          : 'Offline: no internet';
    return this.cacheServedAtState() ? `${state} · showing saved data` : state;
  });

  private started = false;
  private stopped = false;
  private healthCheck: HealthCheck | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_FIRST_MS;
  private removeListeners: () => void = () => undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** empieza a vigilar la conexión y hace el primer chequeo. llamarla más de una vez no hace nada */
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;

    const view = this.document.defaultView;
    const onOnline = (): void => {
      this.onlineState.set(true);
      void this.recheck();
    };
    const onOffline = (): void => {
      this.onlineState.set(false);
      void this.recheck();
    };
    const onVisibilityChange = (): void => {
      if (this.document.visibilityState === 'hidden') this.clearRetry();
      else if (this.backendState() === 'down') void this.recheck();
    };
    view?.addEventListener('online', onOnline);
    view?.addEventListener('offline', onOffline);
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    this.removeListeners = () => {
      view?.removeEventListener('online', onOnline);
      view?.removeEventListener('offline', onOffline);
      this.document.removeEventListener('visibilitychange', onVisibilityChange);
    };

    void this.check();
  }

  /**
   * chequea el backend ahora (para un botón "Reintentar") y devuelve el resultado
   * `backend` no cambia hasta que llega la respuesta
   */
  recheck(): Promise<BackendStatus> {
    this.clearRetry();
    this.retryDelay = RETRY_FIRST_MS;
    return this.check();
  }

  /** uso interno del interceptor: una lectura llegó de la red */
  noteNetworkRead(): void {
    this.cacheServedAtState.set(null);
    this.cacheSavedAtState.set(null);
    this.noteSuccess();
  }

  /** uso interno del interceptor: una lectura se resolvió con la copia guardada el día `savedAt` */
  noteCacheServed(savedAt: Date): void {
    this.cacheServedAtState.set(new Date());
    this.cacheSavedAtState.update((oldest) => (oldest && oldest <= savedAt ? oldest : savedAt));
    this.noteFailure();
  }

  /** uso interno: el backend acaba de responder un pedido */
  noteSuccess(): void {
    if (this.started && this.backendState() !== 'up') this.setBackend('up');
  }

  /** uso interno: un pedido no llegó al backend */
  noteFailure(): void {
    if (!this.started || this.backendState() !== 'up') return;
    // puede ser un tropiezo de ese pedido: el que decide si el backend se cayó es health
    this.backendState.set('checking');
    void this.check();
  }

  private check(): Promise<BackendStatus> {
    if (this.healthCheck) return this.healthCheck.result;
    if (this.stopped) return Promise.resolve(this.backendState());

    let settle: (status: BackendStatus) => void = () => undefined;
    const result = new Promise<BackendStatus>((resolve) => (settle = resolve));
    const check: HealthCheck = { result, settle, request: null };
    this.healthCheck = check;

    const finish = (status: 'up' | 'down'): void => {
      if (this.healthCheck !== check) return;
      this.healthCheck = null;
      this.setBackend(status);
      settle(status);
    };
    check.request = this.api
      .health()
      .pipe(timeout(HEALTH_TIMEOUT_MS))
      .subscribe({ next: () => finish('up'), error: () => finish('down') });
    return result;
  }

  private setBackend(status: 'up' | 'down'): void {
    const previous = this.backendState();
    this.backendState.set(status);
    if (status === 'down') {
      this.scheduleRetry();
      return;
    }
    this.clearRetry();
    this.retryDelay = RETRY_FIRST_MS;
    if (previous === 'down') this.reconnectCountState.update((count) => count + 1);
  }

  private scheduleRetry(): void {
    this.clearRetry();
    // con la pestaña oculta no se gasta red ni batería: al volver se chequea de nuevo
    if (!this.started || this.stopped || this.document.visibilityState === 'hidden') return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(delay * 2, RETRY_MAX_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.check();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private stop(): void {
    this.stopped = true;
    this.removeListeners();
    this.clearRetry();
    const check = this.healthCheck;
    this.healthCheck = null;
    check?.request?.unsubscribe();
    check?.settle(this.backendState());
  }
}
