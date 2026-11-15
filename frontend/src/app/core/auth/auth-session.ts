import { DOCUMENT, DestroyRef, Service, computed, inject, signal } from '@angular/core';

import { AuthUser } from '../models';
import { OFFLINE_STORAGE } from '../offline/storage';

/** dónde queda la sesión (token y usuario) en este dispositivo */
export const AUTH_STORAGE_KEY = 'lotestigo:auth:v1';

/** dueño de lo que se guarda sin sesión: solo respuestas públicas (ejemplos y pasaportes) */
export const PUBLIC_SCOPE = 'anon';

/**
 * claves personales que no llevan el id del usuario, como el borrador del lote que se está
 * marcando: se borran al salir junto con las del usuario
 */
const UNSCOPED_PERSONAL_KEYS: readonly string[] = ['lotestigo:draft:v1'];

/** lo que guardaba la cuenta demo del navegador, de antes de las cuentas: no es de nadie */
const LEGACY_KEYS: readonly string[] = [
  'lotestigo:account:v1',
  'lotestigo:outbox:v1',
  'lotestigo:profit:v1',
  'lotestigo:fertilization:v1',
];
const LEGACY_CACHE_PREFIX = 'lotestigo:cache:v1:';

/** la sesión tal como la entrega el backend y se guarda: el token de DRF y el usuario */
export interface StoredSession {
  token: string;
  user: AuthUser;
}

/** clave de un dato guardado en el dispositivo a nombre de `scope` (`u<id>` o `anon`) */
export function scopedKey(scope: string, name: string): string {
  return `lotestigo:${scope}:${name}`;
}

/** la sesión si `value` tiene la forma `{ token, user: { id, email, name } }`, o null */
export function parseSession(value: unknown): StoredSession | null {
  if (!value || typeof value !== 'object') return null;
  const { token, user } = value as { token?: unknown; user?: unknown };
  if (typeof token !== 'string' || token === '' || !user || typeof user !== 'object') return null;
  const { id, email, name } = user as Partial<Record<keyof AuthUser, unknown>>;
  if (typeof id !== 'number' || !Number.isInteger(id) || typeof email !== 'string' || !email) {
    return null;
  }
  return { token, user: { id, email, name: typeof name === 'string' ? name : '' } };
}

/**
 * la sesión de este dispositivo y la separación por usuario de lo que se guarda en él
 *
 * todo dato personal vive bajo `lotestigo:u<id>:` (ver `userKey`): la copia de las respuestas de
 * la API, la cola de lotes sin conexión, la rentabilidad y la fertilización. al cerrar la sesión
 * se borra todo lo de ese usuario, así quien use después el mismo navegador no ve nada
 *
 * es la pieza de bajo nivel que comparten `AuthService`, el interceptor y el modo sin conexión
 * (no usa HttpClient). las pantallas usan `AuthService`
 */
@Service()
export class AuthSession {
  private readonly storage = inject(OFFLINE_STORAGE);
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly state = signal<StoredSession | null>(null);

  /** quién ingresó en este dispositivo, o null */
  readonly user = computed(() => this.state()?.user ?? null);

  /** el token para el encabezado Authorization, o null */
  readonly token = computed(() => this.state()?.token ?? null);

  /** a nombre de quién se guarda ahora: `u<id>` con sesión, `anon` sin ella */
  readonly scope = computed(() => {
    const user = this.user();
    return user ? userScope(user) : PUBLIC_SCOPE;
  });

  constructor() {
    this.removeKeys((key) => LEGACY_KEYS.includes(key) || key.startsWith(LEGACY_CACHE_PREFIX));
    this.state.set(this.read());

    // otra pestaña ingresó o salió: esta la sigue (los datos ya los borró la otra)
    const onStorage = (event: StorageEvent): void => {
      if (event.key === AUTH_STORAGE_KEY || event.key === null) this.state.set(this.read());
    };
    this.view?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => this.view?.removeEventListener('storage', onStorage));
  }

  /** clave de un dato personal del usuario que ingresó, o null si no ingresó nadie */
  userKey(name: string): string | null {
    const user = this.user();
    return user ? scopedKey(userScope(user), name) : null;
  }

  /** abre la sesión. si había otro usuario en este dispositivo, borra antes lo suyo */
  start(session: StoredSession): void {
    const previous = this.state();
    if (previous && previous.user.id !== session.user.id) this.forget(previous.user);
    this.state.set(session);
    try {
      this.storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // almacenamiento lleno o bloqueado: la sesión vive mientras la pestaña esté abierta
    }
  }

  /** cierra la sesión y borra de este dispositivo todo lo de ese usuario */
  end(): void {
    const previous = this.state();
    this.state.set(null);
    this.removeKeys((key) => key === AUTH_STORAGE_KEY);
    if (previous) this.forget(previous.user);
  }

  private forget(user: AuthUser): void {
    const prefix = scopedKey(userScope(user), '');
    this.removeKeys((key) => key.startsWith(prefix) || UNSCOPED_PERSONAL_KEYS.includes(key));
  }

  private read(): StoredSession | null {
    try {
      const raw = this.storage.getItem(AUTH_STORAGE_KEY);
      return raw ? parseSession(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private removeKeys(match: (key: string) => boolean): void {
    const found: string[] = [];
    try {
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (key !== null && match(key)) found.push(key);
      }
    } catch {
      // sin almacenamiento no hay nada guardado que borrar
    }
    for (const key of found) {
      try {
        this.storage.removeItem(key);
      } catch {
        // nada que hacer: el almacenamiento no está disponible
      }
    }
  }
}

function userScope(user: AuthUser): string {
  return `u${user.id}`;
}
