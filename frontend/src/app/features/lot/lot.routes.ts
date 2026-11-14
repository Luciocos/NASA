import { Routes } from '@angular/router';

// Feature ficha del lote, bitácora y comparación radar contra óptico (Dev B).
export default [
  { path: ':id', loadComponent: () => import('./lot-page/lot-page').then((m) => m.LotPage) },
] satisfies Routes;
