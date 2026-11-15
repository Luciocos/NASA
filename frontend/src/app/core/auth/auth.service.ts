import { HttpClient } from '@angular/common/http';
import { Service, Signal, computed, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { AuthUser } from '../models';
import { AuthSession, parseSession } from './auth-session';

export type { AuthUser } from '../models';

/** cuerpo de POST /api/auth/register/. el nombre es opcional */
export interface RegisterRequest {
  name?: string;
  email: string;
  password: string;
}

/**
 * la cuenta del productor: ingresar, crear la cuenta y salir
 *
 * el backend responde `{ token, user }` y el token viaja en "Authorization: Token <key>" (lo
 * agrega `authInterceptor`). la sesión queda guardada en este dispositivo hasta que se sale
 */
@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AuthSession);

  /** quién ingresó, o null */
  readonly user: Signal<AuthUser | null> = this.session.user;
  readonly loggedIn: Signal<boolean> = computed(() => this.session.user() !== null);

  /** credenciales malas: 400 `{ detail }`. demasiados intentos: 429 */
  login(email: string, password: string): Observable<AuthUser> {
    return this.http
      .post<unknown>('/api/auth/login/', { email: normalizeEmail(email), password })
      .pipe(map((response) => this.begin(response)));
  }

  /** abre la cuenta y la sesión. errores por campo: 400 `{ email: [...], password: [...] }` */
  register(body: RegisterRequest): Observable<AuthUser> {
    const name = body.name?.trim() ?? '';
    return this.http
      .post<unknown>('/api/auth/register/', {
        ...(name ? { name } : {}),
        email: normalizeEmail(body.email),
        password: body.password,
      })
      .pipe(map((response) => this.begin(response)));
  }

  /**
   * sale de la cuenta: borra de este dispositivo la sesión y todo lo del usuario, y le pide al
   * backend que anule el token (sin esperar la respuesta: sin conexión igual se sale)
   */
  logout(): void {
    const token = this.session.token();
    this.session.end();
    if (token) this.revoke(token);
  }

  /** el backend ya no reconoce el token (401): la sesión se cierra acá, igual que al salir */
  expire(): void {
    this.session.end();
  }

  private begin(response: unknown): AuthUser {
    const next = parseSession(response);
    if (!next) throw new Error('La respuesta del servidor no trae la sesión.');
    // otra cuenta seguía abierta en este dispositivo: su token también se anula
    const previous = this.session.token();
    if (previous && this.session.user()?.id !== next.user.id) this.revoke(previous);
    this.session.start(next);
    return next.user;
  }

  private revoke(token: string): void {
    this.http
      .post('/api/auth/logout/', null, { headers: { Authorization: `Token ${token}` } })
      .subscribe({ error: () => undefined });
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
