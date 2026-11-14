import { areaHa } from '../../features/map/geo';
import { PolygonGeometry } from '../models';
import {
  LatLngTuple,
  XY,
  boundsOfGeometries,
  boxCenter,
  createLocalFrame,
  geometryCenter,
  geometryToLocalRings,
  polygonAreaM2,
  ringSignedArea,
  ringsToGeometry,
} from './local-frame';

// punto de referencia cerca de casilda, el mismo que usan las demás pruebas del mapa
const ORIGIN: LatLngTuple = [-33.05, -61.2];

// valores de referencia calculados con pyproj 3.8 (Geod con el elipsoide wgs84), que es el
// cálculo que hace el backend al guardar un lote
const GEODESIC = {
  northOfHundredthDegreeM: 1109.0525800232565,
  eastOfHundredthDegreeM: 934.0046761840742,
  square10KmM2: 99753419.51730347,
  smallLotNorthM2: 303124.6255734265,
  smallLotSouthM2: 302854.55441883206,
  donutM2: 3107583.3678507805,
};

// cuadrado de unos 10 km de lado centrado en el origen
const SQUARE_10_KM: LatLngTuple[] = [
  [-33.095, -61.2535],
  [-33.095, -61.1465],
  [-33.005, -61.1465],
  [-33.005, -61.2535],
];

// lote chico (unas 30 ha) a unos 4,4 km al norte del origen, y el mismo lote corrido 0,08 grados
// al sur, que queda a unos 4,4 km del otro lado
const SMALL_LOT_NORTH: LatLngTuple[] = [
  [-33.012, -61.21],
  [-33.0125, -61.203],
  [-33.0075, -61.2035],
  [-33.008, -61.2095],
];
const SMALL_LOT_SOUTH: LatLngTuple[] = SMALL_LOT_NORTH.map(([lat, lng]) => [lat - 0.08, lng]);

const DONUT: PolygonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-61.21, -33.06],
      [-61.19, -33.06],
      [-61.19, -33.04],
      [-61.21, -33.04],
      [-61.21, -33.06],
    ],
    [
      [-61.205, -33.055],
      [-61.205, -33.045],
      [-61.195, -33.045],
      [-61.195, -33.055],
      [-61.205, -33.055],
    ],
  ],
};

function relativeError(value: number, reference: number): number {
  return Math.abs(value - reference) / reference;
}

function localArea(points: readonly LatLngTuple[], origin = ORIGIN, rotationDeg = 0): number {
  const frame = createLocalFrame(origin, rotationDeg);
  return polygonAreaM2([points.map((point) => frame.toLocal(point))]);
}

describe('createLocalFrame', () => {
  it('pone el origen en el [0, 0] y guarda una copia de sus datos', () => {
    const origin: LatLngTuple = [-33.05, -61.2];
    const frame = createLocalFrame(origin, 30);
    origin[0] = 10;
    expect(frame.origin).toEqual([-33.05, -61.2]);
    expect(frame.rotationDeg).toBe(30);
    const [x, y] = frame.toLocal([-33.05, -61.2]);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
  });

  it('mide en metros con la escala del elipsoide en el origen', () => {
    const frame = createLocalFrame(ORIGIN);
    const [northX, northY] = frame.toLocal([ORIGIN[0] + 0.01, ORIGIN[1]]);
    const [eastX, eastY] = frame.toLocal([ORIGIN[0], ORIGIN[1] + 0.01]);
    expect(northX).toBeCloseTo(0, 9);
    expect(eastY).toBeCloseTo(0, 9);
    // a 1 km del origen el plano tangente y la geodésica difieren en menos de 1 cm
    expect(Math.abs(northY - GEODESIC.northOfHundredthDegreeM)).toBeLessThan(0.01);
    expect(Math.abs(eastX - GEODESIC.eastOfHundredthDegreeM)).toBeLessThan(0.01);
  });

  it('con rotación 0 el eje x apunta al este y el eje y al norte', () => {
    const frame = createLocalFrame(ORIGIN);
    const [x, y] = frame.toLocal([ORIGIN[0] + 0.001, ORIGIN[1] + 0.001]);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    const [westX, southY] = frame.toLocal([ORIGIN[0] - 0.001, ORIGIN[1] - 0.001]);
    expect(westX).toBeLessThan(0);
    expect(southY).toBeLessThan(0);
  });

  it('gira los ejes en sentido antihorario', () => {
    const north: LatLngTuple = [ORIGIN[0] + 0.01, ORIGIN[1]];
    const east: LatLngTuple = [ORIGIN[0], ORIGIN[1] + 0.01];
    // con 90 grados el eje x apunta al norte y el eje y al oeste
    const quarterTurn = createLocalFrame(ORIGIN, 90);
    expect(quarterTurn.toLocal(north)[0]).toBeCloseTo(1109.0535, 3);
    expect(quarterTurn.toLocal(north)[1]).toBeCloseTo(0, 6);
    expect(quarterTurn.toLocal(east)[0]).toBeCloseTo(0, 6);
    expect(quarterTurn.toLocal(east)[1]).toBeCloseTo(-934.0047, 3);
    // con 45 grados un punto al noreste, a igual distancia en cada sentido, cae sobre el eje x
    const diagonal = createLocalFrame(ORIGIN, 45);
    const [x, y] = diagonal.toLocal(createLocalFrame(ORIGIN).toLatLng([500, 500]));
    expect(x).toBeCloseTo(Math.hypot(500, 500), 6);
    expect(y).toBeCloseTo(0, 6);
    // y uno al noroeste cae sobre el eje y
    const [x2, y2] = diagonal.toLocal(createLocalFrame(ORIGIN).toLatLng([-500, 500]));
    expect(x2).toBeCloseTo(0, 6);
    expect(y2).toBeCloseTo(Math.hypot(500, 500), 6);
  });

  it('va y vuelve sin perder precisión, con cualquier rotación', () => {
    const points: LatLngTuple[] = [ORIGIN, [-33.0123456, -61.2567891], [-33.09, -61.15]];
    for (const rotationDeg of [0, 37, 45, 90, -120, 360, 725.5]) {
      const frame = createLocalFrame(ORIGIN, rotationDeg);
      for (const point of points) {
        const [lat, lng] = frame.toLatLng(frame.toLocal(point));
        expect(lat).toBeCloseTo(point[0], 11);
        expect(lng).toBeCloseTo(point[1], 11);
      }
      const [x, y] = frame.toLocal(frame.toLatLng([1234.5, -678.9]));
      expect(x).toBeCloseTo(1234.5, 6);
      expect(y).toBeCloseTo(-678.9, 6);
    }
  });

  it('la rotación no cambia distancias ni superficies', () => {
    const a: LatLngTuple = [-33.04, -61.21];
    const b: LatLngTuple = [-33.06, -61.18];
    const distance = (rotationDeg: number) => {
      const frame = createLocalFrame(ORIGIN, rotationDeg);
      const [ax, ay] = frame.toLocal(a);
      const [bx, by] = frame.toLocal(b);
      return Math.hypot(bx - ax, by - ay);
    };
    expect(distance(37)).toBeCloseTo(distance(0), 6);
    expect(distance(-200)).toBeCloseTo(distance(0), 6);
    expect(localArea(SMALL_LOT_NORTH, ORIGIN, 37)).toBeCloseTo(localArea(SMALL_LOT_NORTH), 4);
  });

  it('rechaza un origen o una rotación que no sirven', () => {
    expect(() => createLocalFrame([Number.NaN, -61.2])).toThrow(RangeError);
    expect(() => createLocalFrame([-33, Number.POSITIVE_INFINITY])).toThrow(RangeError);
    expect(() => createLocalFrame([89, 0])).toThrow(RangeError);
    expect(() => createLocalFrame(ORIGIN, Number.NaN)).toThrow(RangeError);
    expect(() => createLocalFrame([85, 0])).not.toThrow();
  });
});

describe('precisión de superficies del marco local', () => {
  it('coincide con areaHa dentro del 0,1 % en un cuadrado de 10 km centrado en el origen', () => {
    const ha = localArea(SQUARE_10_KM) / 10_000;
    expect(ha).toBeGreaterThan(9900);
    expect(relativeError(ha, areaHa(SQUARE_10_KM))).toBeLessThan(0.001);
  });

  it('coincide con areaHa dentro del 0,1 % en lotes chicos a más de 4 km del origen', () => {
    for (const lot of [SMALL_LOT_NORTH, SMALL_LOT_SOUTH]) {
      expect(relativeError(localArea(lot) / 10_000, areaHa(lot))).toBeLessThan(0.001);
    }
  });

  it('coincide con la superficie geodésica mucho mejor si el origen está en el polígono', () => {
    // centrado en el origen el error de primer orden se compensa
    expect(relativeError(localArea(SQUARE_10_KM), GEODESIC.square10KmM2)).toBeLessThan(0.00002);
    expect(
      relativeError(localArea(SMALL_LOT_NORTH, [-33.01, -61.2065]), GEODESIC.smallLotNorthM2),
    ).toBeLessThan(0.00002);
  });

  it('lejos del origen el error crece cerca de 0,01 % por km al norte o al sur', () => {
    const north = relativeError(localArea(SMALL_LOT_NORTH), GEODESIC.smallLotNorthM2);
    const south = relativeError(localArea(SMALL_LOT_SOUTH), GEODESIC.smallLotSouthM2);
    // los dos lotes están a unos 4,4 km del origen: se espera cerca de 0,045 %
    expect(north).toBeGreaterThan(0.0003);
    expect(north).toBeLessThan(0.0006);
    expect(south).toBeGreaterThan(0.0003);
    expect(south).toBeLessThan(0.0006);
  });

  it('descuenta los huecos igual que el cálculo geodésico', () => {
    const frame = createLocalFrame(geometryCenter(DONUT)!);
    const area = polygonAreaM2(geometryToLocalRings(frame, DONUT));
    expect(relativeError(area, GEODESIC.donutM2)).toBeLessThan(0.00002);
  });
});

describe('anillos y geometrías', () => {
  it('pasa un polígono a anillos locales sin el punto de cierre y con el mismo sentido', () => {
    const frame = createLocalFrame(ORIGIN);
    const [exterior, hole] = geometryToLocalRings(frame, DONUT);
    expect(exterior.length).toBe(4);
    expect(hole.length).toBe(4);
    expect(ringSignedArea(exterior)).toBeGreaterThan(0);
    expect(ringSignedArea(hole)).toBeLessThan(0);
    // el primer punto es el suroeste del exterior: al oeste y al sur del origen
    expect(exterior[0][0]).toBeLessThan(0);
    expect(exterior[0][1]).toBeLessThan(0);
  });

  it('acepta anillos que no vienen cerrados', () => {
    const frame = createLocalFrame(ORIGIN);
    const open: PolygonGeometry = {
      type: 'Polygon',
      coordinates: [DONUT.coordinates[0].slice(0, 4)],
    };
    expect(geometryToLocalRings(frame, open)[0].length).toBe(4);
  });

  it('arma geojson con pares [longitud, latitud], anillos cerrados y 6 decimales', () => {
    const frame = createLocalFrame(ORIGIN, 37);
    const ring: XY[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const geometry = ringsToGeometry(frame, [ring]);
    expect(geometry.type).toBe('Polygon');
    expect(geometry.coordinates.length).toBe(1);
    const positions = geometry.coordinates[0];
    expect(positions.length).toBe(5);
    expect(positions[4]).toEqual(positions[0]);
    expect(positions[4]).not.toBe(positions[0]);
    expect(positions[0]).toEqual([-61.2, -33.05]);
    for (const [lng, lat] of positions) {
      expect(lng).toBe(Math.round(lng * 1e6) / 1e6);
      expect(lat).toBe(Math.round(lat * 1e6) / 1e6);
      expect(lng).toBeLessThan(-61);
      expect(lat).toBeGreaterThan(-34);
    }
  });

  it('permite pedir otra cantidad de decimales', () => {
    const frame = createLocalFrame(ORIGIN, 37);
    const ring: XY[] = [
      [0, 0],
      [33.3, 0],
      [33.3, 33.3],
    ];
    const [lng, lat] = ringsToGeometry(frame, [ring], 8).coordinates[0][1];
    expect(lng).toBe(Math.round(lng * 1e8) / 1e8);
    expect(lat).toBe(Math.round(lat * 1e8) / 1e8);
    expect(lng).not.toBe(Math.round(lng * 1e6) / 1e6);
  });

  it('ida y vuelta: geometría, anillos locales y geometría otra vez', () => {
    for (const rotationDeg of [0, 37]) {
      const frame = createLocalFrame(ORIGIN, rotationDeg);
      expect(ringsToGeometry(frame, geometryToLocalRings(frame, DONUT))).toEqual(DONUT);
    }
  });

  it('un anillo vacío queda vacío', () => {
    const frame = createLocalFrame(ORIGIN);
    expect(ringsToGeometry(frame, [[]]).coordinates).toEqual([[]]);
    expect(ringsToGeometry(frame, []).coordinates).toEqual([]);
  });
});

describe('centro y caja', () => {
  const far: PolygonGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [-61.0, -33.2],
        [-60.9, -33.2],
        [-60.9, -33.1],
        [-61.0, -33.2],
      ],
    ],
  };

  it('calcula la caja [[sur, oeste], [norte, este]] de varios polígonos', () => {
    expect(boundsOfGeometries([DONUT])).toEqual([
      [-33.06, -61.21],
      [-33.04, -61.19],
    ]);
    expect(boundsOfGeometries([DONUT, far])).toEqual([
      [-33.2, -61.21],
      [-33.04, -60.9],
    ]);
  });

  it('no hay caja si no hay polígonos o no tienen coordenadas', () => {
    expect(boundsOfGeometries([])).toBeNull();
    expect(boundsOfGeometries([{ type: 'Polygon', coordinates: [] }])).toBeNull();
    expect(boundsOfGeometries([{ type: 'Polygon', coordinates: [[]] }])).toBeNull();
    expect(geometryCenter({ type: 'Polygon', coordinates: [] })).toBeNull();
  });

  it('saltea coordenadas que no son números', () => {
    const broken: PolygonGeometry = {
      type: 'Polygon',
      coordinates: [[[Number.NaN, -33.5], ...DONUT.coordinates[0]]],
    };
    expect(boundsOfGeometries([broken])).toEqual(boundsOfGeometries([DONUT]));
  });

  it('da el centro de la caja', () => {
    const [lat, lng] = geometryCenter(DONUT)!;
    expect(lat).toBeCloseTo(-33.05, 9);
    expect(lng).toBeCloseTo(-61.2, 9);
    const [boxLat, boxLng] = boxCenter(boundsOfGeometries([DONUT, far])!);
    expect(boxLat).toBeCloseTo(-33.12, 9);
    expect(boxLng).toBeCloseTo(-61.055, 9);
  });
});

describe('superficies en el plano', () => {
  const square: XY[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const hole: XY[] = [
    [2, 2],
    [2, 4],
    [4, 4],
    [4, 2],
  ];

  it('la superficie con signo es positiva en sentido antihorario y negativa en horario', () => {
    expect(ringSignedArea(square)).toBe(100);
    expect(ringSignedArea([...square].reverse())).toBe(-100);
    expect(ringSignedArea(hole)).toBe(-4);
    expect(ringSignedArea([])).toBe(0);
    expect(ringSignedArea(square.slice(0, 2))).toBe(0);
  });

  it('resta los huecos sin depender del sentido de giro', () => {
    expect(polygonAreaM2([square])).toBe(100);
    expect(polygonAreaM2([square, hole])).toBe(96);
    expect(polygonAreaM2([[...square].reverse(), [...hole].reverse()])).toBe(96);
    expect(polygonAreaM2([])).toBe(0);
  });
});
