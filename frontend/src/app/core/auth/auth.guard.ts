import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { HOME_PATH, RETURN_PARAM, loginUrl, safeReturnUrl } from './return-url';

/**
 * Mi campo y Marcar lote piden haber ingresado: sin sesión llevan a /ingresar?volver=<ruta>
 *
 * las fichas, la huella y los ejemplos no lo llevan: el backend decide con un 404 si el lote no
 * es tuyo ni de ejemplo. va en canActivate y en canActivateChild de /mapa
 */
export const authGuard: CanActivateFn = (_route, state) =>
  inject(AuthService).loggedIn() || loginUrl(inject(Router), state.url);

/** /ingresar y /registrarse: quien ya ingresó sigue a ?volver= o a Mi campo */
export const guestGuard: CanActivateFn = (route) =>
  !inject(AuthService).loggedIn() ||
  inject(Router).parseUrl(safeReturnUrl(route.queryParamMap.get(RETURN_PARAM)) ?? HOME_PATH);
