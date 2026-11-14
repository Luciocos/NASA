import { Routes } from '@angular/router';

// Feature pasaporte público (Dev C).
export default [
  {
    path: ':token',
    loadComponent: () => import('./passport-page/passport-page').then((m) => m.PassportPage),
  },
] satisfies Routes;
