// kit de gráficas en svg puro: ancho fluido, tabla equivalente en "Ver datos", es-AR y
// faltantes a la vista ("Sin dato"), nunca interpolados
export { BarChart } from './bar-chart/bar-chart';
export { ColumnChart } from './column-chart/column-chart';
export { DataBar } from './data-bar/data-bar';
export { EventTimelineChart, eventText } from './event-timeline/event-timeline';
export { SeriesChart } from './series-chart/series-chart';
export { StackedBar } from './stacked-bar/stacked-bar';
export { STATUS_META, StatusRing } from './status-ring/status-ring';
export { WaterfallChart, waterfallSpans } from './waterfall/waterfall';

export type { ChartTable } from './kit/chart-frame/chart-frame';
export * from './format';
export * from './types';
