import { Component, input } from '@angular/core';

import { nextChartId } from '../host-width';

/** tabla equivalente a una gráfica: la primera celda de cada fila es su encabezado */
export interface ChartTable {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}

/**
 * marco común de las gráficas: título visible, estado vacío y la tabla de datos
 * equivalente dentro de "Ver datos". el dibujo se proyecta como contenido y hereda de
 * acá la paleta (variables --ck-*)
 */
@Component({
  selector: 'app-chart-frame',
  styleUrls: ['../palette.css', './chart-frame.css'],
  templateUrl: './chart-frame.html',
})
export class ChartFrame {
  readonly title = input<string>();
  readonly empty = input(false);
  readonly emptyText = input('Sin datos para mostrar');
  readonly table = input<ChartTable | null>(null);

  protected readonly titleId = nextChartId('chart-title');
}
