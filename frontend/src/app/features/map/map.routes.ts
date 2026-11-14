import { Routes } from '@angular/router';

// Feature mapa (Dev B).
export default [
  { path: '', loadComponent: () => import('./map-page/map-page').then((m) => m.MapPage) },
] satisfies Routes;
