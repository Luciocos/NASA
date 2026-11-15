import { Routes } from '@angular/router';

import { demoAccountGuard } from './core/account/demo.guard';

// Cada feature declara sus rutas en su propio archivo *.routes.ts.
// Para agregar una pantalla, editar el archivo de la feature, no este.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/landing/landing-page').then((m) => m.LandingPage),
  },
  {
    path: 'mapa',
    canActivate: [demoAccountGuard],
    loadChildren: () => import('./features/map/map.routes'),
  },
  {
    path: 'lotes',
    canActivate: [demoAccountGuard],
    loadChildren: () => import('./features/lot/lot.routes'),
  },
  {
    path: 'huella',
    canActivate: [demoAccountGuard],
    loadChildren: () => import('./features/footprint/footprint.routes'),
  },
  // el pasaporte es público: se abre por enlace sin cuenta
  { path: 'pasaporte', loadChildren: () => import('./features/passport/passport.routes') },
  { path: '**', redirectTo: '' },
];
