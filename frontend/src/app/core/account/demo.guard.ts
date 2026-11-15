import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { DemoAccount } from './demo-account';

/**
 * las pantallas de la app abren la cuenta demo si todavía no hay una: así un enlace directo a
 * /mapa o a la ficha de un lote funciona igual que entrar por "Probar demo"
 */
export const demoAccountGuard: CanActivateFn = () => {
  inject(DemoAccount).start();
  return true;
};
