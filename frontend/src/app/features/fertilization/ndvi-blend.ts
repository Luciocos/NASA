import { PolygonGeometry } from '../../core/models';
import { LatLng, NdviZone, NdviZones, pointInPolygon } from '../../core/nasa';

/**
 * degradado del mapa de ambientes: en vez de pintar cada cuadro de 250 m de un color plano, se
 * mezclan los valores de los cuadros vecinos con un núcleo gaussiano y el color pasa suave de un
 * ambiente al otro. Es solo para ver: superficies, porcentajes y dosis salen de cada cuadro, no
 * de este degradado
 */

/** un cuadro de MODIS como muestra del degradado */
export interface BlendSample {
  center: LatLng;
  value: number;
  /** parte del cuadro dentro del lote, de 0 a 1 (ver NdviPixel.insideShare) */
  share: number;
}

/** colores de relleno de cada ambiente, de bajo a alto */
export const BLEND_COLORS = {
  bajo: [201, 162, 124],
  medio: [220, 182, 81],
  alto: [61, 154, 79],
} as const;

/** transparencia de un cuadro entero y de uno que casi no toca el lote */
const ALPHA_FULL = 0.75;
const ALPHA_EDGE = 0.25;
/** metros por grado de latitud en la esfera de MODIS */
const M_PER_DEG = 111_195;

type Rgb = readonly [number, number, number];

export function samplesOf(zones: NdviZones | null): BlendSample[] {
  return (zones?.zones ?? []).flatMap((zone) =>
    zone.pixels
      .filter((p) => p.value !== null)
      .map((p) => ({ center: p.center, value: p.value as number, share: p.insideShare ?? 1 })),
  );
}

/**
 * valor y parte dentro del lote en un punto, mezclando los cuadros con pesos gaussianos según la
 * distancia a su centro. sigmaM fija cuánto se suaviza (el ancho de la transición)
 */
export function blendAt(
  samples: BlendSample[],
  [lat, lng]: LatLng,
  sigmaM: number,
): { value: number; share: number } | null {
  const k = Math.cos((lat * Math.PI) / 180);
  let weights = 0;
  let value = 0;
  let share = 0;
  for (const s of samples) {
    const dy = (lat - s.center[0]) * M_PER_DEG;
    const dx = (lng - s.center[1]) * M_PER_DEG * k;
    const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaM * sigmaM));
    weights += w;
    value += w * s.value;
    share += w * s.share;
  }
  if (weights < 1e-12) return null;
  return { value: value / weights, share: share / weights };
}

/** color de un NDVI: pasa de un ambiente al otro entre los centros de cada tercio */
export function rampColor(value: number, zones: NdviZone[]): Rgb {
  const stops = (['bajo', 'medio', 'alto'] as const)
    .map((level) => zones.find((z) => z.level === level))
    .filter((z): z is NdviZone => z !== undefined)
    .map((z) => ({ at: (z.from + z.to) / 2, rgb: BLEND_COLORS[z.level] as Rgb }));
  if (stops.length === 0) return BLEND_COLORS.medio;
  if (value <= stops[0].at) return stops[0].rgb;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (value <= b.at) {
      const t = (value - a.at) / (b.at - a.at || 1);
      return a.rgb.map((c, j) => Math.round(c + (b.rgb[j] - c) * t)) as unknown as Rgb;
    }
  }
  return stops[stops.length - 1].rgb;
}

/** más transparente cuanto menos del cuadro cae en el lote, igual que los píxeles mixtos */
export function alphaFor(share: number): number {
  return ALPHA_EDGE + (ALPHA_FULL - ALPHA_EDGE) * Math.min(1, Math.max(0, share));
}

export interface BlendImage {
  url: string;
  /** esquinas [sur-oeste, norte-este] en [lat, lng] */
  bounds: [LatLng, LatLng];
}

/**
 * imagen del degradado recortada al lote, para un L.imageOverlay. null si no hay ambientes o el
 * navegador no tiene canvas (por ejemplo, en las pruebas)
 */
export function renderBlend(
  zones: NdviZones | null,
  geometry: PolygonGeometry,
  cellSizeM: number,
  doc: Document,
  width = 360,
): BlendImage | null {
  const samples = samplesOf(zones);
  const ring = geometry.coordinates[0];
  if (!samples.length || !ring?.length || !zones) return null;
  const lats = ring.map((p) => p[1]);
  const lngs = ring.map((p) => p[0]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const k = Math.cos((((south + north) / 2) * Math.PI) / 180);
  // en el mapa (Mercator) el alto en píxeles sigue la latitud dividida por el coseno
  const height = Math.max(
    1,
    Math.round((width * (north - south)) / (Math.max(east - west, 1e-9) * k)),
  );
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.min(height, 1200);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(canvas.width, canvas.height);
  // la transición ocupa más o menos medio cuadro a cada lado del borde entre ambientes
  const sigmaM = cellSizeM * 0.35;
  for (let y = 0; y < canvas.height; y++) {
    const lat = north - ((y + 0.5) / canvas.height) * (north - south);
    for (let x = 0; x < canvas.width; x++) {
      const lng = west + ((x + 0.5) / canvas.width) * (east - west);
      if (!pointInPolygon([lat, lng], geometry)) continue;
      const blend = blendAt(samples, [lat, lng], sigmaM);
      if (!blend) continue;
      const [r, g, b] = rampColor(blend.value, zones.zones);
      const i = (y * canvas.width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = Math.round(alphaFor(blend.share) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return {
    url: canvas.toDataURL('image/png'),
    bounds: [
      [south, west],
      [north, east],
    ],
  };
}
