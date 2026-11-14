import { Provider } from '@angular/core';

import { MemoryStorage, OFFLINE_STORAGE } from './storage';

/**
 * proveedores para los specs que tocan la cola de lotes o la copia de datos: les da un
 * almacenamiento en memoria nuevo en cada prueba, así nada de lo guardado pasa de una a otra
 * (jsdom comparte un mismo localStorage entre todas las pruebas de un archivo)
 */
export function provideOfflineTesting(): Provider[] {
  return [{ provide: OFFLINE_STORAGE, useFactory: () => new MemoryStorage() }];
}
