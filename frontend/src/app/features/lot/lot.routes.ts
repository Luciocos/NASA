import { Routes } from '@angular/router';

// Feature ficha del lote, bitácora y comparación radar contra óptico (Dev B).
export default [
  { path: ':id', loadComponent: () => import('./lot-page/lot-page').then((m) => m.LotPage) },
  {
    path: ':id/fertilizacion',
    loadComponent: () =>
      import('../fertilization/fertilization-page').then((m) => m.FertilizationPage),
  },
  {
    path: ':id/rentabilidad',
    loadComponent: () => import('../profit/profit-page/profit-page').then((m) => m.ProfitPage),
  },
] satisfies Routes;
