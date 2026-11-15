import { Routes } from '@angular/router';

import { LotTabKey } from '../../shared/ui/lot-tabs/lot-tabs';

const lotPage = () => import('./lot-page/lot-page').then((m) => m.LotPage);

// el espacio del lote como página, para los enlaces directos (Dev B). desde Mi campo y Ejemplos
// el lote se abre en un popup (?lote=12&seccion=huella); estas rutas siguen andando con el mismo
// encabezado y las mismas pestañas. la Huella vive en /huella/:lotId
export default [
  { path: ':id', loadComponent: lotPage, data: { tab: 'satellite' satisfies LotTabKey } },
  { path: ':id/bitacora', loadComponent: lotPage, data: { tab: 'log' satisfies LotTabKey } },
  {
    path: ':id/practicas',
    loadComponent: lotPage,
    data: { tab: 'practices' satisfies LotTabKey },
  },
  {
    path: ':id/fertilizacion',
    loadComponent: () =>
      import('../fertilization/fertilization-page').then((m) => m.FertilizationPage),
  },
  {
    path: ':id/rentabilidad',
    loadComponent: () => import('../profit/profit-page/profit-page').then((m) => m.ProfitPage),
  },
  {
    path: ':id/cuenca',
    loadComponent: () => import('../water/water-page').then((m) => m.WaterPage),
  },
  {
    path: ':id/pasaporte',
    loadComponent: lotPage,
    data: { tab: 'passport' satisfies LotTabKey },
  },
] satisfies Routes;
