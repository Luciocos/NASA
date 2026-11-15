import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, DestroyRef, Service, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, firstValueFrom, map, of, throwError, timeout } from 'rxjs';

import { Api } from '../api';
import { LotCreate, LotDetail } from '../models';
import { ApiCacheStore } from './api-cache-store';
import { Connectivity } from './connectivity';
import { describeBackendError, isConnectivityError } from './http-errors';
import { OFFLINE_STORAGE } from './storage';

const STORAGE_KEY = 'lotestigo:outbox:v1';
const LOCK_NAME = 'lotestigo:outbox:sync';

// con señal mala un alta puede quedar colgada minutos: pasado este tiempo va a la cola
const UPLOAD_TIMEOUT_MS = 20_000;
const RETRY_FIRST_MS = 5_000;
const RETRY_MAX_MS = 60_000;

/** un lote marcado sin conexión que todavía no está en el backend */
export interface PendingLot {
  /** identificador local, estable hasta que el lote se sube o se descarta */
  localId: string;
  body: LotCreate;
  /** cuándo se marcó, en ISO 8601 */
  createdAt: string;
  /** intentos de subida que fallaron */
  attempts: number;
  /** true si el backend lo rechazó: no se vuelve a subir hasta `retry()` */
  rejected: boolean;
  /** motivo del rechazo, listo para mostrar */
  error: string | null;
}

/** resultado de `createOrQueue`: el lote quedó en el backend o en la cola de este dispositivo */
export type LotSaveResult =
  { kind: 'created'; lot: LotDetail } | { kind: 'queued'; pending: PendingLot };

/** un lote de la cola que ya está en el backend */
export interface SyncedLot {
  localId: string;
  lot: LotDetail;
}

/**
 * cola persistente de los lotes marcados sin conexión
 *
 * se sube sola cuando el backend responde (al iniciar la app y cada vez que vuelve la conexión)
 * y también a mano con `sync()`. un rechazo del backend no se pierde: queda en `pending` con
 * `rejected` y su `error` hasta que se corrige (`discard` + `createOrQueue`) o se descarta
 */
@Service()
export class LotOutbox {
  private readonly api = inject(Api);
  private readonly connectivity = inject(Connectivity);
  private readonly cache = inject(ApiCacheStore);
  private readonly storage = inject(OFFLINE_STORAGE);
  private readonly destroyRef = inject(DestroyRef);
  private readonly view = inject(DOCUMENT).defaultView;

  private readonly pendingState = signal<PendingLot[]>(this.read() ?? []);
  private readonly syncingState = signal(false);
  private readonly lastSyncedState = signal<SyncedLot[]>([]);
  private readonly unsavedState = signal(this.storage.volatile === true);

  /** la cola en orden de llegada. incluye los rechazados */
  readonly pending = this.pendingState.asReadonly();

  /** true mientras se está subiendo la cola */
  readonly syncing = this.syncingState.asReadonly();

  /** lo que subió la última sincronización que subió algo (para destacarlo en el mapa) */
  readonly lastSynced = this.lastSyncedState.asReadonly();

  /**
   * true si la cola no se pudo guardar en el dispositivo: vive solo mientras la pestaña
   * siga abierta
   */
  readonly unsaved = this.unsavedState.asReadonly();

  private running: Promise<void> | null = null;
  private destroyed = false;
  private writeFailed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_FIRST_MS;
  private retryNotBefore = 0;

  constructor() {
    // otra pestaña cambió la cola
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY || event.key === null) this.refresh();
    };
    this.view?.addEventListener('storage', onStorage);
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.view?.removeEventListener('storage', onStorage);
      this.clearRetry();
    });

    effect(() => {
      if (this.connectivity.backend() === 'up') untracked(() => this.autoSync());
    });
  }

  /**
   * da de alta el lote. si no se llega al backend (sin red, 502, 503, 504 o demora excesiva)
   * lo guarda en la cola y emite 'queued'. cualquier otro error, como un 400 de validación,
   * se propaga para que el formulario lo muestre
   */
  createOrQueue(body: LotCreate): Observable<LotSaveResult> {
    return this.api.createLot(body).pipe(
      timeout(UPLOAD_TIMEOUT_MS),
      map((lot): LotSaveResult => {
        this.connectivity.noteSuccess();
        return { kind: 'created', lot };
      }),
      catchError((error: unknown) => {
        if (!isConnectivityError(error)) return throwError(() => error);
        this.connectivity.noteFailure();
        return of<LotSaveResult>({ kind: 'queued', pending: this.enqueue(body) });
      }),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  /**
   * sube en orden los pendientes no rechazados. una falla de conexión corta la pasada
   * si ya hay una pasada en curso devuelve esa misma: nunca corren dos a la vez
   */
  sync(): Promise<void> {
    this.running ??= this.withLock(() => this.uploadPending()).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** saca un lote de la cola sin subirlo */
  discard(localId: string): void {
    this.commit(this.pendingState().filter((item) => item.localId !== localId));
  }

  /** le quita el rechazo a un lote y vuelve a intentar subir la cola */
  retry(localId: string): Promise<void> {
    this.patch(localId, (item) => ({ ...item, rejected: false, error: null }));
    return this.sync();
  }

  private autoSync(): void {
    this.clearRetry();
    const wait = this.retryNotBefore - Date.now();
    if (wait <= 0) {
      void this.sync();
      return;
    }
    // la pasada anterior falló hace poco: sin esta espera, un alta que falla con el backend
    // sano se reintentaría sin pausa
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.connectivity.backend() === 'up') void this.sync();
    }, wait);
  }

  private async withLock(task: () => Promise<void>): Promise<void> {
    const locks = this.view?.navigator.locks;
    if (!locks) return task();
    // si otra pestaña ya está subiendo la cola, esta no la sube también
    await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (lock) await task();
    });
  }

  private async uploadPending(): Promise<void> {
    this.refresh();
    const uploaded: SyncedLot[] = [];
    const tried = new Set<string>();
    // la cola se vuelve a mirar en cada vuelta: mientras se sube puede cambiar
    const next = (): PendingLot | undefined =>
      this.pendingState().find((item) => !item.rejected && !tried.has(item.localId));
    if (!next()) return;

    this.syncingState.set(true);
    try {
      for (let item = next(); item && !this.destroyed; item = next()) {
        tried.add(item.localId);
        const lot = await this.upload(item);
        if (lot === 'unreachable') break;
        if (lot) uploaded.push({ localId: item.localId, lot });
      }
    } finally {
      this.syncingState.set(false);
      if (uploaded.length > 0) this.lastSyncedState.set(uploaded);
    }
  }

  /** devuelve el lote creado, null si el backend lo rechazó o 'unreachable' si no se llegó */
  private async upload(item: PendingLot): Promise<LotDetail | 'unreachable' | null> {
    try {
      const lot = await firstValueFrom(
        this.api
          .createLot(item.body)
          .pipe(timeout(UPLOAD_TIMEOUT_MS), takeUntilDestroyed(this.destroyRef)),
      );
      this.connectivity.noteSuccess();
      this.retryDelay = RETRY_FIRST_MS;
      this.retryNotBefore = 0;
      this.commit(this.pendingState().filter((queued) => queued.localId !== item.localId));
      return lot;
    } catch (error) {
      if (this.destroyed) return 'unreachable';
      if (isConnectivityError(error)) {
        this.retryNotBefore = Date.now() + this.retryDelay;
        this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
        this.patch(item.localId, (queued) => ({ ...queued, attempts: queued.attempts + 1 }));
        this.connectivity.noteFailure();
        return 'unreachable';
      }
      this.patch(item.localId, (queued) => ({
        ...queued,
        attempts: queued.attempts + 1,
        rejected: true,
        error: rejectionMessage(error),
      }));
      return null;
    }
  }

  private enqueue(body: LotCreate): PendingLot {
    const pending: PendingLot = {
      localId: newLocalId(this.view),
      body,
      createdAt: new Date().toISOString(),
      attempts: 1,
      rejected: false,
      error: null,
    };
    this.commit([...this.pendingState(), pending]);
    return pending;
  }

  private patch(localId: string, change: (item: PendingLot) => PendingLot): void {
    this.commit(
      this.pendingState().map((item) => (item.localId === localId ? change(item) : item)),
    );
  }

  private commit(queue: PendingLot[]): void {
    this.pendingState.set(queue);
    let saved = this.write(queue);
    // lo que marcó el productor vale más que las copias del backend, que se vuelven a bajar
    while (!saved && this.cache.makeRoom()) saved = this.write(queue);
    this.writeFailed = !saved;
    this.unsavedState.set(!saved || this.storage.volatile === true);
  }

  private write(queue: PendingLot[]): boolean {
    try {
      if (queue.length === 0) this.storage.removeItem(STORAGE_KEY);
      else this.storage.setItem(STORAGE_KEY, JSON.stringify(queue));
      return true;
    } catch {
      return false;
    }
  }

  private read(): PendingLot[] | null {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      const stored: unknown = raw === null ? [] : JSON.parse(raw);
      return Array.isArray(stored) ? stored.filter(isPendingLot) : [];
    } catch {
      return null;
    }
  }

  /** toma lo que haya guardado otra pestaña */
  private refresh(): void {
    // si la última escritura falló, lo que hay en memoria es lo único completo
    if (this.writeFailed) return;
    const stored = this.read();
    if (stored && JSON.stringify(stored) !== JSON.stringify(this.pendingState())) {
      this.pendingState.set(stored);
    }
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

function isPendingLot(value: unknown): value is PendingLot {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<PendingLot>;
  return (
    typeof item.localId === 'string' &&
    typeof item.body === 'object' &&
    item.body !== null &&
    typeof item.createdAt === 'string' &&
    typeof item.attempts === 'number' &&
    typeof item.rejected === 'boolean' &&
    (item.error === null || typeof item.error === 'string')
  );
}

function newLocalId(view: Window | null): string {
  const crypto = view?.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID solo existe en contextos seguros (https o localhost)
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rejectionMessage(error: unknown): string {
  const detail = describeBackendError(error);
  if (detail) return detail;
  return error instanceof HttpErrorResponse
    ? `El backend respondió con un error (${error.status}).`
    : 'El backend no aceptó el lote.';
}
