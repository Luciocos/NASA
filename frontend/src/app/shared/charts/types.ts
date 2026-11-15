import { CriterionStatus, EventType, Origin } from '../../core/models';

/**
 * tono semántico de una marca. el color sale de los tokens del proyecto y nunca es la
 * única señal: los tres orígenes del dato llevan además su trama (verificado liso,
 * declarado rayado, estimado punteado) o su forma (círculo lleno, rombo, círculo hueco)
 */
export type ChartTone =
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'verified'
  | 'declared'
  | 'estimated'
  | 'accent'
  | 'water'
  | 'soil';

/** tono que le corresponde a cada origen del dato */
export const ORIGIN_TONE: Record<Origin, ChartTone> = {
  VERIFIED: 'verified',
  DECLARED: 'declared',
  ESTIMATED: 'estimated',
};

/** evento de la línea de tiempo (app-event-timeline) */
export interface TimelineEvent {
  id: number | string;
  type: EventType;
  /** nombre visible del tipo: rotula la fila ("Siembra") */
  typeLabel: string;
  /** fecha de detección, AAAA-MM-DD */
  date: string;
  /** más y menos días de incertidumbre de la fecha. null: no se informa */
  uncertaintyDays: number | null;
  origin: Origin;
  /** nombre visible del sensor real ("NISAR", "HLS") */
  sensorLabel: string;
  /** dato simulado para la demostración: se dibuja con contorno discontinuo */
  simulated: boolean;
  campaignLabel?: string | null;
}

/** barra de app-bar-chart. value null se dibuja como fila con trama y "Sin dato" */
export interface BarItem {
  label: string;
  value: number | null;
  /** aclaración corta que se muestra bajo el rótulo */
  note?: string;
  /** por defecto 'neutral' */
  tone?: ChartTone;
}

/** línea de referencia vertical de app-bar-chart */
export interface BarThreshold {
  value: number;
  /** rótulo de la línea. si es simétrica conviene escribirlo sin signo ("Umbral ±1,03 dB") */
  label: string;
  /** dibuja la línea también en el valor negativo */
  symmetric?: boolean;
}

/** punto de una serie de app-series-chart */
export interface SeriesPoint {
  /** AAAA-MM-DD */
  date: string;
  /** null: no hay dato en esa fecha (nubes, sin pasada). corta la línea, nunca se interpola */
  value: number | null;
  /** aclaración corta que acompaña al valor ("antes", "última imagen", "nubes") */
  label?: string;
}

/** serie de app-series-chart: puntos unidos por una línea recta, sin suavizar */
export interface ChartSeries {
  name: string;
  /** por defecto se asigna en orden fijo: water, accent, soil y después neutral */
  tone?: ChartTone;
  points: readonly SeriesPoint[];
}

/** línea vertical rotulada de app-series-chart (por ejemplo un evento de la bitácora) */
export interface SeriesMarker {
  /** AAAA-MM-DD */
  date: string;
  label: string;
}

/** franja horizontal de referencia de app-series-chart */
export interface SeriesBand {
  from: number;
  to: number;
  label: string;
}

/** columna de app-column-chart. value null se dibuja con trama y "Sin dato" */
export interface ColumnItem {
  label: string;
  value: number | null;
  /** por defecto 'neutral' */
  tone?: ChartTone;
  /** aclaración que va al globo y a la tabla ("2 días sin registro") */
  note?: string;
}

/** tramo de app-stacked-bar. con value 0 no se dibuja pero figura en la leyenda */
export interface StackedSegment {
  key: string;
  label: string;
  value: number;
  tone: ChartTone;
}

/**
 * paso de app-waterfall. 'total' dibuja una barra desde cero hasta value; 'delta' sube o
 * baja value desde el acumulado anterior
 */
export interface WaterfallStep {
  label: string;
  value: number;
  kind: 'total' | 'delta';
}

/** criterio de app-status-ring */
export interface StatusRingItem {
  label: string;
  status: CriterionStatus;
}
