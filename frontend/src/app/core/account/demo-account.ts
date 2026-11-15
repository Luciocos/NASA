import {
  DOCUMENT,
  DestroyRef,
  Service,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import { LotOutbox } from '../offline/lot-outbox';
import { OFFLINE_STORAGE } from '../offline/storage';

const STORAGE_KEY = 'lotestigo:account:v1';

/**
 * cuenta demo gratuita: vive en este navegador, sin mail ni contraseña
 *
 * el backend no tiene usuarios (CLAUDE.md, sección 17): la cuenta solo recuerda qué lotes
 * marcó quien usa este navegador, para mostrarle "sus" lotes. los lotes se guardan en el
 * backend como cualquier otro
 */
export interface DemoSession {
  /** identificador local de la cuenta */
  id: string;
  name: string;
  plan: 'free';
  /** cuándo se abrió, en ISO 8601 */
  createdAt: string;
  /** ids del backend de los lotes que marcó esta cuenta, en orden de alta */
  lotIds: number[];
}

@Service()
export class DemoAccount {
  private readonly storage = inject(OFFLINE_STORAGE);
  private readonly outbox = inject(LotOutbox);
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly state = signal<DemoSession | null>(this.read());

  /** la cuenta abierta, o null si todavía no se tocó "Probar demo" */
  readonly session = this.state.asReadonly();
  readonly active = computed(() => this.state() !== null);
  readonly lotIds = computed<ReadonlySet<number>>(() => new Set(this.state()?.lotIds ?? []));

  constructor() {
    // otra pestaña abrió, cerró o cambió la cuenta
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY || event.key === null) this.state.set(this.read());
    };
    this.view?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => this.view?.removeEventListener('storage', onStorage));

    // los lotes marcados sin conexión pasan a la cuenta cuando la cola los sube
    effect(() => {
      const synced = this.outbox.lastSynced();
      untracked(() => synced.forEach(({ lot }) => this.addLot(lot.id)));
    });
  }

  /** abre la cuenta si no hay una y la devuelve */
  start(): DemoSession {
    const current = this.state();
    if (current) return current;
    const session: DemoSession = {
      id: localId(),
      name: 'Cuenta demo',
      plan: 'free',
      createdAt: new Date().toISOString(),
      lotIds: [],
    };
    this.commit(session);
    return session;
  }

  /** suma un lote a la cuenta (abre la cuenta si hacía falta) */
  addLot(id: number): void {
    const session = this.state() ?? this.start();
    if (session.lotIds.includes(id)) return;
    this.commit({ ...session, lotIds: [...session.lotIds, id] });
  }

  /** saca un lote de la cuenta. el lote sigue en el backend */
  removeLot(id: number): void {
    const session = this.state();
    if (!session || !session.lotIds.includes(id)) return;
    this.commit({ ...session, lotIds: session.lotIds.filter((lotId) => lotId !== id) });
  }

  owns(id: number): boolean {
    return this.lotIds().has(id);
  }

  /** cierra la cuenta en este navegador. no borra lotes del backend */
  end(): void {
    this.state.set(null);
    try {
      this.storage.removeItem(STORAGE_KEY);
    } catch {
      // sin almacenamiento la cuenta igual se cierra en memoria
    }
  }

  private commit(session: DemoSession): void {
    this.state.set(session);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // almacenamiento lleno o bloqueado: la cuenta sigue viva mientras la pestaña esté abierta
    }
  }

  private read(): DemoSession | null {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<DemoSession> | null;
      if (!value || typeof value.id !== 'string' || !Array.isArray(value.lotIds)) return null;
      return {
        id: value.id,
        name: typeof value.name === 'string' && value.name ? value.name : 'Cuenta demo',
        plan: 'free',
        createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
        lotIds: value.lotIds.filter((id): id is number => Number.isInteger(id)),
      };
    } catch {
      return null;
    }
  }
}

function localId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
