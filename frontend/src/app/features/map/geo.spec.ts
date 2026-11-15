import { areaHa, ringCentroid, ringSelfIntersects, toPolygonGeometry } from './geo';
import { LatLng } from './polygon-editor';

// Cuadrado armado para la prueba: 0,009 grados de lado cerca de Casilda (unos 1 km x 0,84 km).
const SQUARE: LatLng[] = [
  [-33.05, -61.2],
  [-33.05, -61.191],
  [-33.041, -61.191],
  [-33.041, -61.2],
];

describe('geo', () => {
  it('calcula una superficie del orden esperado y no depende del sentido de giro', () => {
    const ha = areaHa(SQUARE);
    // 1000 m (latitud) x 840 m (longitud a -33°) = unas 84 ha
    expect(ha).toBeGreaterThan(80);
    expect(ha).toBeLessThan(88);
    expect(areaHa([...SQUARE].reverse())).toBeCloseTo(ha, 6);
  });

  it('devuelve 0 con menos de 3 vértices', () => {
    expect(areaHa(SQUARE.slice(0, 2))).toBe(0);
  });

  it('arma GeoJSON con [longitud, latitud] y el anillo cerrado', () => {
    const geometry = toPolygonGeometry(SQUARE);
    const ring = geometry.coordinates[0];
    expect(geometry.type).toBe('Polygon');
    expect(ring[0]).toEqual([-61.2, -33.05]);
    expect(ring.length).toBe(SQUARE.length + 1);
    expect(ring[ring.length - 1]).toEqual(ring[0]);
  });

  it('detecta un perímetro que se cruza a sí mismo', () => {
    expect(ringSelfIntersects(SQUARE)).toBe(false);
    // las mismas esquinas en otro orden forman un moño: dos lados se cortan
    const bowtie: LatLng[] = [SQUARE[0], SQUARE[2], SQUARE[1], SQUARE[3]];
    expect(ringSelfIntersects(bowtie)).toBe(true);
    // una esquina que vuelve sobre el lado anterior también cruza
    const spike: LatLng[] = [...SQUARE, [-33.041, -61.195]];
    expect(ringSelfIntersects(spike)).toBe(true);
    // una esquina en medio de un lado recto no cruza
    const straight: LatLng[] = [SQUARE[0], [-33.05, -61.195], ...SQUARE.slice(1)];
    expect(ringSelfIntersects(straight)).toBe(false);
  });

  it('ubica el centro del polígono para la etiqueta de hectáreas', () => {
    const [lat, lng] = ringCentroid(SQUARE)!;
    expect(lat).toBeCloseTo(-33.0455, 6);
    expect(lng).toBeCloseTo(-61.1955, 6);
    expect(ringCentroid([])).toBeNull();
  });
});
