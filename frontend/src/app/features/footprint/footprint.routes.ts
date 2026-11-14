import { Routes } from '@angular/router';

// Feature huella y simulador (Dev C).
export default [
  {
    path: ':lotId',
    loadComponent: () => import('./footprint-page/footprint-page').then((m) => m.FootprintPage),
  },
] satisfies Routes;
