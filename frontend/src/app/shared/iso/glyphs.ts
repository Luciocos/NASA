import { IsoGlyph } from './model';

/** lado de la caja en la que están dibujados los glifos */
export const ISO_GLYPH_BOX = 24;

/** grosor del trazo para el que están pensados, en unidades de la caja */
export const ISO_GLYPH_STROKE = 2;

/**
 * dibujo de cada glifo como atributo `d` de un path, en una caja de 24 por 24
 *
 * son trazos sin relleno: se dibujan con línea de grosor 2 y puntas y uniones redondeadas. el
 * mismo texto sirve para un `<path>` de svg y para `new Path2D(d)` en un canvas
 */
export const ISO_GLYPH_PATHS: Readonly<Record<IsoGlyph, string>> = {
  // brote con dos hojas sobre la línea del suelo y semillas en el surco
  SOWING:
    'M3.5 16.5h17M12 16.5V9M12 12.5C8.6 12.5 6.3 10.6 6 7.2c3.4 0 5.7 1.9 6 5.3zM12 9c.2-3.2 2.4-5.2 6-5.5-.2 3.300-2.400 5.300-6 5.500zM7.500 20.500h.01M12 20.500h.01M16.500 20.500h.01',
  // espiga de trigo
  HARVEST:
    'M12 21.500v-4.500M12 17c-2.600 0-4.200-1.600-4.200-4.200 2.600 0 4.200 1.600 4.200 4.200zM12 17c2.600 0 4.200-1.600 4.200-4.200-2.600 0-4.200 1.600-4.200 4.200zM12 12.300c-2.600 0-4.200-1.600-4.200-4.200 2.600 0 4.200 1.600 4.200 4.200zM12 12.300c2.600 0 4.200-1.600 4.200-4.200-2.600 0-4.200 1.600-4.200 4.200zM12 7.700c-1.300-1.500-1.300-3.600 0-5.200 1.300 1.600 1.300 3.700 0 5.200z',
  // herramienta que entra al suelo y deja dos surcos en zigzag
  TILLAGE:
    'M12 2.500v6M9.500 6l2.500 2.500 2.500-2.500M3 15.500l3-3 3 3 3-3 3 3 3-3 3 3M3 21l3-3 3 3 3-3 3 3 3-3 3 3',
  // trébol: tres folíolos y el tallo
  COVER_CROP:
    'M12 3.300a3.400 3.400 0 1 0 0 6.800a3.400 3.400 0 1 0 0-6.800M7.300 9.300a3.400 3.400 0 1 0 0 6.800a3.400 3.400 0 1 0 0-6.800M16.700 9.300a3.400 3.400 0 1 0 0 6.800a3.400 3.400 0 1 0 0-6.800M12 12.500c0 3.500.600 6 2.300 8.500',
  // gota sobre dos líneas de agua
  FLOODING:
    'M12 2.800c2.200 2.600 3.300 4.400 3.300 5.900a3.300 3.300 0 0 1-6.600 0c0-1.500 1.100-3.300 3.300-5.900zM3 16c1.500-1.400 3-1.400 4.500 0s3 1.400 4.500 0 3-1.400 4.500 0 3 1.400 4.500 0M3 20.500c1.500-1.400 3-1.400 4.500 0s3 1.400 4.500 0 3-1.400 4.500 0 3 1.400 4.500 0',
  // llama
  BURN: 'M12.500 2.500c.500 3.200 2.200 4.800 3.800 6.800 1.200 1.500 1.900 3.100 1.900 5 0 3.700-2.800 6.400-6.200 6.400s-6.200-2.700-6.200-6.400c0-2.300 1.100-4 2.700-5.600.300 1.500.900 2.500 2 3.100-.200-3.500.300-6.600 2-9.300zM12 20.700c-1.500 0-2.700-1.200-2.700-2.800 0-1.300.900-2.300 2.700-4.200 1.800 1.900 2.700 2.900 2.700 4.200 0 1.600-1.200 2.800-2.700 2.800z',
  // dos flechas que se cruzan: un uso reemplaza a otro
  LAND_USE_CHANGE: 'M3.500 8h16M16 4.500L19.500 8 16 11.500M20.500 16h-16M8 12.500L4.500 16 8 19.500',
  // nube con una flecha hacia arriba: falta subirlo al servidor
  PENDING:
    'M7.500 18.500a4 4 0 0 1-.800-7.920A5.500 5.500 0 0 1 17.300 9.400a4.600 4.600 0 0 1-.300 9.100M12 21v-7.500M9 16.500l3-3 3 3',
  // círculo discontinuo con una raya: no hay dato
  NO_DATA:
    'M20.280 13.910A8.500 8.500 0 0 1 17.800 18.220M14.490 20.130A8.500 8.500 0 0 1 9.510 20.130M6.200 18.220A8.500 8.500 0 0 1 3.720 13.910M3.720 10.090A8.500 8.500 0 0 1 6.200 5.780M9.510 3.870A8.500 8.500 0 0 1 14.490 3.870M17.800 5.780A8.500 8.500 0 0 1 20.280 10.090M9 12h6',
};

/** todos los glifos, para armar una leyenda o recorrerlos en una prueba */
export const ISO_GLYPHS = Object.keys(ISO_GLYPH_PATHS) as IsoGlyph[];

/** `d` del glifo pedido. un tipo desconocido cae en NO_DATA para que nunca falte el dibujo */
export function isoGlyphPath(glyph: IsoGlyph): string {
  return ISO_GLYPH_PATHS[glyph] ?? ISO_GLYPH_PATHS.NO_DATA;
}
