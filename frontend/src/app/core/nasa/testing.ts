import { Provider } from '@angular/core';

import { NasaCache } from './cache';
import { createNasaClients } from './clients';
import { NASA_CLIENTS } from './lot-satellite';

/**
 * clientes de la NASA para los specs de pantallas: nunca salen a internet ni tocan la Cache API.
 * cada pedido falla al instante como sin conexión, así las pantallas muestran su "Sin dato"
 */
export function provideNasaTesting(): Provider[] {
  return [
    {
      provide: NASA_CLIENTS,
      useFactory: () =>
        createNasaClients({
          cache: new NasaCache(null),
          isOnline: () => false,
          fetch: () => Promise.reject(new TypeError('sin red en las pruebas')),
          sleep: () => Promise.resolve(),
        }),
    },
  ];
}
