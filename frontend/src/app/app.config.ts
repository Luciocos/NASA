import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  DOCUMENT,
  inject,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  ViewTransitionInfo,
  provideRouter,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { apiCacheInterceptor } from './core/offline/api-cache.interceptor';
import { provideOffline } from './core/offline/provide-offline';

// quien pidió menos movimiento cambia de pantalla sin el fundido
function skipTransitionIfReducedMotion({ transition }: ViewTransitionInfo): void {
  const view = inject(DOCUMENT).defaultView;
  if (view?.matchMedia('(prefers-reduced-motion: reduce)').matches) transition.skipTransition();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: skipTransitionIfReducedMotion,
      }),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    // primero el token: la copia sin conexión ve el pedido ya firmado, y un 401 del backend (que
    // la copia nunca tapa) vuelve hasta authInterceptor, que cierra la sesión
    provideHttpClient(withInterceptors([authInterceptor, apiCacheInterceptor])),
    provideOffline(),
    // el service worker solo va en el build de producción: con ng serve no hay ngsw-worker.js
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
