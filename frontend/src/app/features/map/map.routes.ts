import { Routes } from '@angular/router';

// Feature mapa (Dev B).
export default [
  { path: '', loadComponent: () => import('./map-page/map-page').then((m) => m.MapPage) },
  { path: 'nuevo', loadComponent: () => import('./lot-draw/lot-draw').then((m) => m.LotDraw) },
] satisfies Routes;
