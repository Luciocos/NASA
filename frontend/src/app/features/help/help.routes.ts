import { Routes } from '@angular/router';

// la ayuda es pública: se muestra o se comparte sin cuenta
export default [
  { path: '', loadComponent: () => import('./help-page/help-page').then((m) => m.HelpPage) },
] satisfies Routes;
