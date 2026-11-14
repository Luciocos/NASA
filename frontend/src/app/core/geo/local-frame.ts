import { PolygonGeometry } from '../models';

/** par [latitud, longitud] en grados, el orden que usa leaflet */
export type LatLngTuple = [number, number];

/** par [x, y] en metros dentro de un marco local */
export type XY = [number, number];

/** caja en lat/lng como [[sur, oeste], [norte, este]]: leaflet la acepta tal cual en fitBounds */
export type LatLngBox = [LatLngTuple, LatLngTuple];

/**
 * plano tangente local: pasa de lat/lng a metros alrededor de un origen, y vuelve
 *
 * con rotación 0 el eje x apunta al este y el eje y al norte. la conversión es lineal, así que
 * una recta en lat/lng sigue siendo recta en metros y las celdas de una grilla quedan todas iguales
 */
export interface LocalFrame {
  /** punto [lat, lng] que cae en el [0, 0] local. es una copia: cambiarla no mueve el marco */
  readonly origin: LatLngTuple;
  /** giro antihorario de los ejes locales respecto de este y norte, en grados */
  readonly rotationDeg: number;
  /** de [lat, lng] a metros locales [x, y] */
  toLocal(point: Readonly<LatLngTuple>): XY;
  /** de metros locales [x, y] a [lat, lng] */
  toLatLng(point: Readonly<XY>): LatLngTuple;
}

const DEG = Math.PI / 180;
// elipsoide wgs84: semieje mayor en metros y aplanamiento
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
// cerca de los polos un grado de longitud casi no mide nada y el plano tangente deja de servir
const MAX_ORIGIN_LAT = 85;

/**
 * arma un marco local con origen en `origin` y los ejes girados `rotationDeg` grados en sentido
 * antihorario respecto de este y norte
 *
 * usa los radios de curvatura del elipsoide wgs84 en la latitud del origen (el del meridiano
 * para los metros por grado de latitud y el del primer vertical para los de longitud), así que
 * la escala es exacta en el origen. a `d` km al norte o al sur, las superficies se desvían cerca
 * de `0,01 % × d` en la zona núcleo: conviene que el origen quede a pocos km de lo que se mide
 * (para un polígono centrado en el origen el error es mucho menor porque se compensa)
 *
 * @example
 * const frame = createLocalFrame([-33.05, -61.2], 45);
 * const [x, y] = frame.toLocal([-33.04, -61.19]);
 * const [lat, lng] = frame.toLatLng([x, y]);
 *
 * @throws RangeError si el origen o la rotación no son números finitos, o si la latitud del
 * origen pasa de 85 grados
 */
export function createLocalFrame(origin: Readonly<LatLngTuple>, rotationDeg = 0): LocalFrame {
  const [lat0, lng0] = origin;
  if (!Number.isFinite(lat0) || !Number.isFinite(lng0) || Math.abs(lat0) > MAX_ORIGIN_LAT) {
    throw new RangeError(`origen inválido para un marco local: [${lat0}, ${lng0}]`);
  }
  if (!Number.isFinite(rotationDeg)) {
    throw new RangeError(`rotación inválida para un marco local: ${rotationDeg}`);
  }
  const phi = lat0 * DEG;
  const w2 = 1 - WGS84_E2 * Math.sin(phi) ** 2;
  const meridionalRadius = (WGS84_A * (1 - WGS84_E2)) / (w2 * Math.sqrt(w2));
  const primeVerticalRadius = WGS84_A / Math.sqrt(w2);
  const metersPerDegLat = DEG * meridionalRadius;
  const metersPerDegLng = DEG * primeVerticalRadius * Math.cos(phi);
  const cos = Math.cos(rotationDeg * DEG);
  const sin = Math.sin(rotationDeg * DEG);

  return {
    origin: [lat0, lng0],
    rotationDeg,
    toLocal([lat, lng]) {
      const east = (lng - lng0) * metersPerDegLng;
      const north = (lat - lat0) * metersPerDegLat;
      return [east * cos + north * sin, north * cos - east * sin];
    },
    toLatLng([x, y]) {
      const east = x * cos - y * sin;
      const north = x * sin + y * cos;
      return [lat0 + north / metersPerDegLat, lng0 + east / metersPerDegLng];
    },
  };
}

/**
 * anillos de un polígono geojson en metros locales: primero el exterior y después los huecos
 *
 * cada anillo sale sin el punto de cierre repetido y conserva el sentido de giro del original
 */
export function geometryToLocalRings(frame: LocalFrame, geometry: PolygonGeometry): XY[][] {
  return geometry.coordinates.map((ring) =>
    openRing(ring).map(([lng, lat]) => frame.toLocal([lat, lng])),
  );
}

/**
 * polígono geojson a partir de anillos en metros locales (exterior primero, después los huecos)
 *
 * cierra cada anillo, escribe pares [longitud, latitud] y redondea a `decimals` decimales (6 por
 * defecto, unos 10 cm, igual que toPolygonGeometry). no reordena los puntos: para cumplir con
 * rfc 7946 el exterior tiene que venir en sentido antihorario y los huecos en sentido horario
 */
export function ringsToGeometry(
  frame: LocalFrame,
  rings: readonly (readonly Readonly<XY>[])[],
  decimals = 6,
): PolygonGeometry {
  const factor = 10 ** decimals;
  const round = (value: number) => Math.round(value * factor) / factor;
  const coordinates = rings.map((ring) => {
    const positions = ring.map((point) => {
      const [lat, lng] = frame.toLatLng(point);
      return [round(lng), round(lat)];
    });
    if (positions.length > 0) positions.push([...positions[0]]);
    return positions;
  });
  return { type: 'Polygon', coordinates };
}

/**
 * caja [[sur, oeste], [norte, este]] que contiene a todos los polígonos, o null si no hay ninguno
 * con coordenadas. sirve para encuadrar el mapa y para elegir el origen de un marco común
 *
 * @example
 * const box = boundsOfGeometries(lots.map((lot) => lot.geometry));
 * if (box) frame = createLocalFrame(boxCenter(box));
 */
export function boundsOfGeometries(geometries: Iterable<PolygonGeometry>): LatLngBox | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const geometry of geometries) {
    // el anillo exterior alcanza: los huecos quedan adentro
    for (const [lng, lat] of geometry.coordinates[0] ?? []) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lng);
      east = Math.max(east, lng);
    }
  }
  if (south > north) return null;
  return [
    [south, west],
    [north, east],
  ];
}

/** centro [lat, lng] de una caja */
export function boxCenter(box: Readonly<LatLngBox>): LatLngTuple {
  const [[south, west], [north, east]] = box;
  return [(south + north) / 2, (west + east) / 2];
}

/**
 * centro [lat, lng] de la caja que contiene al polígono, o null si no tiene coordenadas
 *
 * es el centro de la caja y no el centroide: para elegir el origen de un marco alcanza y sobra
 */
export function geometryCenter(geometry: PolygonGeometry): LatLngTuple | null {
  const box = boundsOfGeometries([geometry]);
  return box ? boxCenter(box) : null;
}

/**
 * superficie con signo de un anillo en metros cuadrados (fórmula de gauss): positiva si gira en
 * sentido antihorario, negativa si gira en sentido horario. el anillo va sin repetir el primero
 */
export function ringSignedArea(ring: readonly Readonly<XY>[]): number {
  let twiceArea = 0;
  for (let k = 0; k < ring.length; k++) {
    const [x1, y1] = ring[k];
    const [x2, y2] = ring[(k + 1) % ring.length];
    twiceArea += x1 * y2 - x2 * y1;
  }
  return twiceArea / 2;
}

/**
 * superficie de un polígono en metros cuadrados: el exterior (primer anillo) menos los huecos
 *
 * no depende del sentido de giro de los anillos
 */
export function polygonAreaM2(rings: readonly (readonly Readonly<XY>[])[]): number {
  if (rings.length === 0) return 0;
  const [exterior, ...holes] = rings;
  const holesArea = holes.reduce((sum, hole) => sum + Math.abs(ringSignedArea(hole)), 0);
  return Math.max(0, Math.abs(ringSignedArea(exterior)) - holesArea);
}

function openRing(ring: number[][]): number[][] {
  const last = ring.length - 1;
  const closed = last > 0 && ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1];
  return closed ? ring.slice(0, last) : ring;
}
