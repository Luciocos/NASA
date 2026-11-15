import type { Origin, PolygonGeometry } from '../models';

/** punto en grados, en el orden de Leaflet: [lat, lng] */
export type LatLng = [number, number];

/** lo mínimo que necesita la capa satelital de un lote */
export interface LotRef {
  id: number | string;
  geometry: PolygonGeometry;
}

/** estado de una consulta para pintarla mientras llega */
export interface LoadState<T> {
  status: 'idle' | 'loading' | 'partial' | 'ready' | 'error';
  data: T | null;
  /** de 0 a 1: cuánto del pedido ya llegó */
  progress: number;
  /** true si es una copia guardada que no se pudo renovar */
  stale: boolean;
  /** cuándo se obtuvo de la red lo que se muestra (ISO) */
  updatedAt: string | null;
  /** motivo para mostrar junto a "Sin dato" */
  error: string | null;
}

/** un día de NASA POWER; null es un faltante del servicio (-999) */
export interface ClimateDay {
  /** AAAA-MM-DD */
  date: string;
  rainMm: number | null;
  tMaxC: number | null;
  tMinC: number | null;
  /** humedad del suelo superficial, de 0 (seco) a 1 (saturado) */
  soilTop: number | null;
  /** humedad del suelo en la zona de raíces, de 0 a 1 */
  soilRoot: number | null;
}

export type NdviQuality = 'good' | 'marginal' | 'cloudy' | 'no_data';

/** NDVI de un lote en un compuesto MODIS de 16 días */
export interface NdviObservation {
  /** fecha de inicio del compuesto, AAAA-MM-DD */
  date: string;
  satellite: 'Terra' | 'Aqua';
  /** null si no hubo píxeles válidos (nublado o sin dato) */
  mean: number | null;
  min: number | null;
  max: number | null;
  /** píxeles considerados: los del lote, o 1 si solo se usó el del centroide */
  pixels: number;
  validPixels: number;
  quality: NdviQuality;
  /** true si ningún centro de píxel cae dentro del lote y se usó el del centroide */
  centroidOnly: boolean;
}

export interface NdviPixel {
  /** las cuatro esquinas del píxel */
  ring: LatLng[];
  center: LatLng;
  /** NDVI de -0.2 a 1, o null si es relleno */
  value: number | null;
  /** 0 bueno, 1 marginal, 2 nieve, 3 nublado, -1 sin dato */
  reliability: number | null;
  /** true si alguna parte del píxel cae dentro del lote */
  inside: boolean;
  /** hectáreas del píxel dentro del lote (pesa en promedios y ambientes); sin lote, 0 */
  insideHa?: number;
  /** recorte del píxel con el lote, para dibujar: contorno y después huecos (ver cellOverlap) */
  clip?: LatLng[][];
}

export interface NdviGrid {
  date: string;
  satellite: 'Terra' | 'Aqua';
  cellSizeM: number;
  pixels: NdviPixel[];
}

export interface LandCoverYear {
  year: number;
  /** clase IGBP de 1 a 17, o null si no hay dato */
  classId: number | null;
  label: string;
}

export interface SatelliteScene {
  mission: 'NISAR' | 'HLS';
  sensorLabel: string;
  /** inicio de la toma, ISO con hora UTC */
  start: string;
  /** nubosidad de toda la escena en %, solo HLS */
  cloudCover: number | null;
  track: string | null;
  frame: string | null;
  cycle: string | null;
  direction: 'ascendente' | 'descendente' | null;
  maturity: 'provisional' | 'validada' | null;
  title: string;
}

/** pasadas encontradas en el catálogo para un polígono */
export interface SceneList {
  items: SatelliteScene[];
  /** total informado por el catálogo; puede ser mayor que items si se cortó la página */
  total: number;
}

export interface GibsLayer {
  id: string;
  title: string;
  description: string;
  ext: 'png' | 'jpg';
  tileMatrixSet: string;
  maxNativeZoom: number;
  attribution: string;
  kind: 'base' | 'overlay';
  origin: Origin;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface DataSourceInfo {
  name: string;
  product: string;
  resolution: string;
  cadence: string;
  origin: Origin;
  note: string;
}

/** resumen honesto de la serie: las variaciones solo existen si están ambos compuestos */
export interface NdviSummary {
  latest: NdviObservation | null;
  previous: NdviObservation | null;
  lastYear: NdviObservation | null;
  changeVsPrevious: number | null;
  changeVsLastYear: number | null;
}

export type NdviZoneLevel = 'alto' | 'medio' | 'bajo';

export interface NdviZone {
  level: NdviZoneLevel;
  label: string;
  /** límites del tercio del rango */
  from: number;
  to: number;
  pixels: NdviPixel[];
  /** parte de la superficie válida del lote (la que cae dentro del polígono), de 0 a 1 */
  share: number;
}

export interface NdviZones {
  date: string;
  min: number | null;
  max: number | null;
  validPixels: number;
  /** de alto a bajo; vacío si no alcanza para dividir */
  zones: NdviZone[];
  note: string | null;
}
