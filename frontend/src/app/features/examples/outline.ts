import { PolygonGeometry } from '../../core/models';

/** lado de la caja donde se dibuja el contorno (el viewBox del svg) */
export const OUTLINE_BOX = 100;
const PAD = 10;

/**
 * el contorno exterior del lote como trazo de svg, centrado en una caja de 100 × 100 con el
 * norte arriba. las longitudes se achican por el coseno de la latitud para que la forma no se
 * estire. null si la geometría no alcanza para dibujar algo
 */
export function outlinePath(geometry: PolygonGeometry | null | undefined): string | null {
  const ring = geometry?.coordinates?.[0] ?? [];
  const points = ring.filter(
    (point) => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]),
  );
  if (points.length < 3) return null;

  const meanLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length;
  const shrink = Math.cos((meanLat * Math.PI) / 180);
  const xs = points.map(([lon]) => lon * shrink);
  const ys = points.map(([, lat]) => lat);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 0)) return null;

  const inner = OUTLINE_BOX - 2 * PAD;
  const scale = inner / span;
  const offsetX = PAD + (inner - (maxX - minX) * scale) / 2;
  const offsetY = PAD + (inner - (maxY - minY) * scale) / 2;
  const commands = xs.map((x, index) => {
    const px = offsetX + (x - minX) * scale;
    const py = offsetY + (maxY - ys[index]) * scale;
    return `${index === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
  });
  return `${commands.join(' ')} Z`;
}
