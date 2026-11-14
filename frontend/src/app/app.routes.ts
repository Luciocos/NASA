import { Routes } from '@angular/router';

// Cada feature declara sus rutas en su propio archivo *.routes.ts.
// Para agregar una pantalla, editar el archivo de la feature, no este.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'mapa' },
  { path: 'mapa', loadChildren: () => import('./features/map/map.routes') },
  { path: 'lotes', loadChildren: () => import('./features/lot/lot.routes') },
  { path: 'huella', loadChildren: () => import('./features/footprint/footprint.routes') },
  { path: 'pasaporte', loadChildren: () => import('./features/passport/passport.routes') },
  { path: '**', redirectTo: 'mapa' },
];
