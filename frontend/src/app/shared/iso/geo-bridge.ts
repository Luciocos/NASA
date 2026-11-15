import {
  LocalFrame,
  boundsOfGeometries,
  boxCenter,
  createLocalFrame,
  geometryToLocalRings,
} from '../../core/geo/local-frame';
import { PolygonGeometry } from '../../core/models';
import { IsoRing } from './model';

/**
 * marco métrico común para dibujar varios lotes en la misma maqueta: su origen es el centro de
 * la caja que los contiene a todos. null si no hay geometrías
 */
export function isoFrameFor(geometries: Iterable<PolygonGeometry>): LocalFrame | null {
  const box = boundsOfGeometries(geometries);
  return box ? createLocalFrame(boxCenter(box)) : null;
}

/** anillos de un polígono en metros del marco, listos para un IsoLot */
export function geometryToIsoRings(frame: LocalFrame, geometry: PolygonGeometry): IsoRing[] {
  return geometryToLocalRings(frame, geometry).filter((ring) => ring.length >= 3);
}
