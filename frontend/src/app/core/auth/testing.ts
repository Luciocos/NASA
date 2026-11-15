import { Provider } from '@angular/core';

import { AuthUser } from '../models';
import { KeyValueStorage, MemoryStorage, OFFLINE_STORAGE } from '../offline/storage';
import { AUTH_STORAGE_KEY } from './auth-session';

/** usuario armado para las pruebas: no es una cuenta real */
export const TEST_USER: AuthUser = { id: 7, email: 'productora@ejemplo.com', name: 'Ana' };
export const TEST_TOKEN = 'token-de-prueba';

/** deja guardada una sesión, como si ya hubiera ingresado. va antes de crear los servicios */
export function storeTestSession(
  storage: KeyValueStorage,
  user: AuthUser = TEST_USER,
  token: string = TEST_TOKEN,
): void {
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
}

/**
 * como `provideOfflineTesting()`, pero con alguien que ya ingresó: un almacenamiento en memoria
 * nuevo en cada prueba, con la sesión de `user` guardada
 */
export function provideSignedInTesting(user: AuthUser = TEST_USER): Provider[] {
  return [
    {
      provide: OFFLINE_STORAGE,
      useFactory: () => {
        const storage = new MemoryStorage();
        storeTestSession(storage, user);
        return storage;
      },
    },
  ];
}
