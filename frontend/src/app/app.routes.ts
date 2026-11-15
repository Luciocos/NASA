import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';

// Cada feature declara sus rutas en su propio archivo *.routes.ts.
// Para agregar una pantalla, editar el archivo de la feature, no este.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/landing/landing-page').then((m) => m.LandingPage),
  },
  // ingresar y crear la cuenta: quien ya ingresó sigue de largo a su campo
  {
    path: 'ingresar',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'registrarse',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register-page/register-page').then((m) => m.RegisterPage),
  },
  // los lotes de ejemplo de la NASA son públicos
  {
    path: 'ejemplos',
    loadComponent: () => import('./features/examples/examples-page').then((m) => m.ExamplesPage),
  },
  // Mi campo y Marcar lote piden haber ingresado
  {
    path: 'mapa',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadChildren: () => import('./features/map/map.routes'),
  },
  // las fichas y la huella no llevan guard: el backend responde 404 si el lote no es tuyo ni de
  // ejemplo, y los de ejemplo se ven sin cuenta
  { path: 'lotes', loadChildren: () => import('./features/lot/lot.routes') },
  { path: 'huella', loadChildren: () => import('./features/footprint/footprint.routes') },
  // el pasaporte es público: se abre por enlace sin cuenta
  { path: 'pasaporte', loadChildren: () => import('./features/passport/passport.routes') },
  { path: '**', redirectTo: '' },
];
