import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';

import { Connectivity } from './connectivity';
import { LotOutbox } from './lot-outbox';

/**
 * pone en marcha el modo sin conexión al iniciar la app: crea la cola de lotes (que se sube
 * sola cuando el backend responde) y empieza a vigilar la conexión
 *
 * va en `app.config.ts`. el interceptor se registra aparte, con
 * `provideHttpClient(withInterceptors([apiCacheInterceptor]))`
 */
export function provideOffline(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      // la cola primero: así ya escucha cuando llega el primer resultado de health
      inject(LotOutbox);
      inject(Connectivity).start();
    }),
  ]);
}
