import { Router, UrlTree } from '@angular/router';

export const LOGIN_PATH = '/ingresar';
export const REGISTER_PATH = '/registrarse';
/** adónde se va después de ingresar si no hay una ruta para volver */
export const HOME_PATH = '/mapa';
/** parámetro con la ruta a la que se vuelve después de ingresar */
export const RETURN_PARAM = 'volver';

/** true si la ruta es una de las pantallas de ingreso */
export function isAuthScreen(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return path === LOGIN_PATH || path === REGISTER_PATH;
}

/**
 * la ruta interna a la que volver, o null si no sirve: tiene que empezar con una sola barra
 * (nada de otro sitio) y no ser una pantalla de ingreso (nada de idas y vueltas)
 */
export function safeReturnUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return null;
  return isAuthScreen(url) ? null : url;
}

/** /ingresar con la ruta a la que volver (salvo que sea la landing o no sirva) */
export function loginUrl(router: Router, returnTo: string | null): UrlTree {
  const back = safeReturnUrl(returnTo);
  return router.createUrlTree([LOGIN_PATH], {
    queryParams: back && back !== '/' ? { [RETURN_PARAM]: back } : {},
  });
}
