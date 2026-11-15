import { HttpHeaders, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, of, tap, throwError } from 'rxjs';

import { ApiCacheStore } from './api-cache-store';
import { Connectivity } from './connectivity';
import { isConnectivityError } from './http-errors';

/** encabezado de las respuestas que salieron de la copia: trae la fecha en que se guardó */
export const SAVED_COPY_HEADER = 'X-LoTestigo-Saved-At';

// lecturas de lotes (ficha, bitácora, huella, puntaje), ejemplos y pasaportes. health queda
// afuera a propósito: tiene que decir la verdad sobre el backend, no repetir una respuesta vieja
const CACHEABLE_PATH = /^\/api\/(lots|examples|passports)(\/|$)/;

/**
 * guarda cada lectura de lotes y pasaportes que llega de la red y, cuando no se puede llegar
 * al backend (sin red, 502, 503 o 504), responde con la última copia guardada de esa misma url
 *
 * sin copia se propaga el error original. un 404, 400, 401 o 410 se propaga siempre: ahí el
 * backend respondió y una copia vieja sería mentir
 *
 * la copia es de quien hizo el pedido (`ApiCacheStore.scope`): si mientras viaja la respuesta
 * alguien sale o entra, no se guarda a nombre de otro
 */
export const apiCacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || req.responseType !== 'json' || !isCacheable(req.url)) {
    return next(req);
  }
  const store = inject(ApiCacheStore);
  const connectivity = inject(Connectivity);
  const key = req.urlWithParams;
  const scope = store.scope();

  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.ok) {
        if (store.scope() === scope) store.set(key, event.body, new Date(), scope);
        connectivity.noteNetworkRead();
      }
    }),
    catchError((error: unknown) => {
      if (!isConnectivityError(error)) return throwError(() => error);
      const saved = store.get(key, scope);
      if (!saved) {
        connectivity.noteFailure();
        return throwError(() => error);
      }
      connectivity.noteCacheServed(saved.savedAt);
      return of(
        new HttpResponse({
          body: saved.body,
          status: 200,
          statusText: 'OK',
          url: key,
          headers: new HttpHeaders({ [SAVED_COPY_HEADER]: saved.savedAt.toISOString() }),
        }),
      );
    }),
  );
};

function isCacheable(url: string): boolean {
  try {
    // la url puede venir absoluta: lo que decide es la ruta
    return CACHEABLE_PATH.test(new URL(url, 'http://localhost').pathname);
  } catch {
    return false;
  }
}
