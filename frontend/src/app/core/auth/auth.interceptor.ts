import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { AuthSession } from './auth-session';
import { isAuthScreen, loginUrl } from './return-url';

const SIGN_IN_PATHS: ReadonlySet<string> = new Set(['/api/auth/login/', '/api/auth/register/']);

/**
 * agrega "Authorization: Token <key>" a los pedidos al backend propio: /api/ del mismo origen,
 * nunca a los servicios de la NASA aunque su ruta también empiece con /api/
 *
 * ante un 401 de /api/ (salvo /api/auth/) la sesión ya no vale: se cierra, borrando lo del
 * usuario, y se lleva a /ingresar?volver=<ruta>. una lectura que viajó con el token vencido se
 * repite una vez sin él, así lo público (ejemplos, pasaportes) sigue andando sin sesión
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const path = ownApiPath(req.url, inject(DOCUMENT));
  // ingresar y crear la cuenta van sin token: uno vencido haría fallar el ingreso con un 401
  if (path === null || SIGN_IN_PATHS.has(path)) return next(req);

  const session = inject(AuthSession);
  const token = session.token();
  const sent =
    token && !req.headers.has('Authorization')
      ? req.clone({ setHeaders: { Authorization: `Token ${token}` } })
      : req;
  // /api/auth/ (me, logout) responde por sí mismo: un 401 ahí no cierra ni redirige nada
  if (path.startsWith('/api/auth/')) return next(sent);

  const auth = inject(AuthService);
  const router = inject(Router);
  const toLogin = (): void => {
    // durante una navegación, la ruta a la que se volverá es la que se estaba abriendo
    const pending = router.currentNavigation();
    const current = pending
      ? router.serializeUrl(pending.finalUrl ?? pending.extractedUrl)
      : router.url;
    if (!isAuthScreen(current)) void router.navigateByUrl(loginUrl(router, current));
  };

  return next(sent).pipe(
    catchError((error: unknown) => {
      if (!isUnauthorized(error)) return throwError(() => error);
      if (sent !== req) {
        const current = session.token();
        // otra cuenta ingresó mientras viajaba el pedido: este 401 no habla de ella
        if (current !== null && current !== token) return throwError(() => error);
        // el token ya no vale. si otro pedido en paralelo ya cerró la sesión, no se repite
        if (current === token) auth.expire();
        if (req.method === 'GET') {
          return next(req).pipe(
            catchError((retryError: unknown) => {
              if (isUnauthorized(retryError)) toLogin();
              return throwError(() => retryError);
            }),
          );
        }
      }
      toLogin();
      return throwError(() => error);
    }),
  );
};

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

/** la ruta si el pedido va a /api/ del mismo origen; null si va a otro sitio o a otra ruta */
function ownApiPath(url: string, document: Document): string | null {
  let path = url;
  // una url absoluta (o que empieza con //) solo cuenta si es de este mismo sitio
  if (!/^\/(?!\/)/.test(url)) {
    try {
      const target = new URL(url);
      if (target.origin !== document.location?.origin) return null;
      path = target.pathname;
    } catch {
      return null;
    }
  }
  path = path.split(/[?#]/, 1)[0];
  return path.startsWith('/api/') ? path : null;
}
