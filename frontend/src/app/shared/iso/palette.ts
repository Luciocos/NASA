import { Crop } from '../../core/models';
import { IsoCover, IsoTone } from './model';

/**
 * colores de la maqueta. salen de los tokens de src/styles/tokens.css, pero resueltos acá como
 * constantes: el canvas no entiende variables css y leer estilos computados en cada cuadro
 * sería caro. si cambia un token hay que cambiar su copia en TOKENS
 */
const TOKENS = {
  ink: '#16241b',
  ink2: '#3a4a3f',
  ink3: '#56645a',
  paper: '#f5f2e9',
  field900: '#12401f',
  soil700: '#6b4429',
  soil500: '#96633f',
  soil300: '#c9a27c',
  water600: '#2a6fb0',
  water300: '#8dc3ea',
  night900: '#0b1622',
  nightInk: '#e8eef5',
  nightInk2: '#a9b8c8',
  accent: '#f2a43a',
  accentStrong: '#d98512',
  originVerified: '#1b6e3a',
  originDeclared: '#1a4f8b',
  originEstimated: '#8a5a00',
} as const;

function channels(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** mezcla dos colores hex: `t` 0 da el primero y 1 el segundo */
export function mix(from: string, to: string, t: number): string {
  const a = channels(from);
  const b = channels(to);
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

/** color hex con transparencia, como rgb() con alfa */
export function alpha(hex: string, opacity: number): string {
  const [r, g, b] = channels(hex);
  return `rgb(${r} ${g} ${b} / ${opacity})`;
}

/** tres tonos de una cara lateral: iluminada (mira a la izquierda), de frente y en sombra */
export type WallTones = readonly [string, string, string];

function wallTones(base: string, lit: number, front: number, shade: number): WallTones {
  return [mix(base, '#000000', lit), mix(base, '#000000', front), mix(base, '#000000', shade)];
}

const SHADE = '#0d1a12';

/** dibujo de planta que se usa cuando se ve el lote de cerca */
export type PlantKind = 'bush' | 'stalk' | 'ear' | 'tuft' | 'sprout' | 'stub' | 'clod' | 'none';

/** cómo se pinta una textura. las medidas relativas son fracciones de la separación entre hileras */
export interface CoverStyle {
  /** color plano de la cara superior */
  top: string;
  /** franja superior de los laterales, del color de lo que crece arriba */
  band: WallTones;
  /** color de las hileras, o null si la textura no lleva */
  row: string | null;
  rowWidth: number;
  /** largo de cada trazo de la hilera; 0 es línea continua */
  rowDash: number;
  plant: PlantKind;
  plantDark: string;
  plantLight: string;
  plantAccent: string;
}

function style(
  top: string,
  row: string | null,
  rowWidth: number,
  rowDash: number,
  plant: PlantKind,
  plantDark = top,
  plantLight = top,
  plantAccent = top,
): CoverStyle {
  return {
    top,
    band: wallTones(top, 0.16, 0.3, 0.44),
    row,
    rowWidth,
    rowDash,
    plant,
    plantDark,
    plantLight,
    plantAccent,
  };
}

const SOIL_TAN = '#c9a67f';
const SOIL_SOWN = '#bb9068';

const CROP_STYLES: Record<Crop, CoverStyle> = {
  // matas bajas, verde medio
  SOY: style('#3f9440', '#6cbd55', 0.52, 0, 'bush', '#2c7a33', '#7ccb5f', '#a5dd7c'),
  // plantas altas, verde intenso
  CORN: style('#1f7a37', '#3fa449', 0.44, 0, 'stalk', '#155f2a', '#4fb552', '#e3c257'),
  // dorado verdoso con espigas
  WHEAT: style('#aca23c', '#d9c659', 0.56, 0, 'ear', '#8a8a34', '#c2bb4e', '#ecd36c'),
  OTHER: style('#479a62', '#79c188', 0.5, 0, 'tuft', '#2f7a4a', '#86cf93', '#b3e2b4'),
};

const SOWN_STYLES: Record<Crop, CoverStyle> = {
  SOY: style(SOIL_SOWN, '#62b944', 0.24, 0.55, 'sprout', '#3f9a35', '#7ed058'),
  CORN: style(SOIL_SOWN, '#4fae3f', 0.24, 0.55, 'sprout', '#2f8a33', '#6cc552'),
  WHEAT: style(SOIL_SOWN, '#8fb93f', 0.24, 0.55, 'sprout', '#6f9a2f', '#a9cf55'),
  OTHER: style(SOIL_SOWN, '#62b944', 0.24, 0.55, 'sprout', '#3f9a35', '#7ed058'),
};

const COVER_STYLES: Record<Exclude<IsoCover, 'crop' | 'sown'>, CoverStyle> = {
  bare: style(SOIL_TAN, null, 0, 0, 'none'),
  tilled: style('#74492c', '#a8744a', 0.46, 0, 'clod', '#553320', '#bd8a5d'),
  cover: style('#79c063', '#62ab53', 0.3, 0, 'tuft', '#4f9a48', '#9ad67c', '#b9e596'),
  stubble: style('#dbc06d', '#b6923c', 0.3, 0.8, 'stub', '#a8842f', '#ecd88f'),
  flooded: style('#3f86c4', null, 0, 0, 'none'),
  burnt: style('#85755f', null, 0, 0, 'none'),
  unknown: style('#b7bbb3', null, 0, 0, 'none'),
};

/** estilo de una textura. el cultivo solo cambia el dibujo de 'crop' y de 'sown' */
export function coverStyle(cover: IsoCover, crop: Crop | null | undefined): CoverStyle {
  if (cover === 'crop') return CROP_STYLES[crop ?? 'OTHER'] ?? CROP_STYLES.OTHER;
  if (cover === 'sown') return SOWN_STYLES[crop ?? 'OTHER'] ?? SOWN_STYLES.OTHER;
  return COVER_STYLES[cover] ?? COVER_STYLES.unknown;
}

/** color del borde y del glifo de un marcador, por origen del dato */
export const TONE_COLORS: Record<IsoTone, string> = {
  verified: TOKENS.originVerified,
  declared: TOKENS.originDeclared,
  estimated: TOKENS.originEstimated,
  neutral: TOKENS.ink3,
};

export const PALETTE = {
  // fondo: bruma arriba, suelo abajo
  haze: '#edf3f1',
  hazeLow: '#e9eee0',
  ground: '#dde2c5',
  vignette: alpha(TOKENS.field900, 0.16),
  gridLine: TOKENS.ink2,
  gridMinorAlpha: 0.13,
  gridMajorAlpha: 0.26,
  shadow: alpha(SHADE, 0.085),

  // bloque de tierra
  soil: [mix(TOKENS.soil500, TOKENS.soil300, 0.28), TOKENS.soil500, TOKENS.soil700] as WallTones,
  outline: alpha(SHADE, 0.5),
  rim: 'rgb(255 255 255 / 0.5)',
  hover: 'rgb(255 255 255 / 0.14)',
  darken: [alpha(SHADE, 0.2), alpha(SHADE, 0.36), alpha(SHADE, 0.52)] as WallTones,

  // texturas especiales
  bareGrain: mix(SOIL_TAN, TOKENS.soil700, 0.3),
  bareSpeck: mix(SOIL_TAN, '#ffffff', 0.35),
  water: '#3f86c4',
  waterDeep: '#2f73b2',
  waterGlint: 'rgb(214 237 252 / 0.85)',
  shore: '#b39069',
  ash: '#85755f',
  char: '#2d2823',
  charSoft: '#4f453b',
  tintRow: 'rgb(255 255 255 / 0.2)',
  noData: '#dcdcd3',
  hatch: alpha(TOKENS.ink3, 0.75),

  // estados
  accent: TOKENS.accent,
  accentStrong: TOKENS.accentStrong,
  accentGlow: alpha(TOKENS.accent, 0.32),
  draftTop: '#fdf1d6',
  draftLine: alpha(TOKENS.accentStrong, 0.55),
  draftWalls: [
    mix(TOKENS.accent, '#ffffff', 0.15),
    TOKENS.accentStrong,
    mix(TOKENS.accentStrong, '#000000', 0.22),
  ] as WallTones,
  pendingBorder: TOKENS.ink2,
  handleFill: '#ffffff',

  // marcadores y rótulos
  balloon: '#ffffff',
  balloonShadow: alpha(SHADE, 0.22),
  simulatedRing: TOKENS.ink2,
  labelBg: alpha(TOKENS.night900, 0.88),
  labelText: TOKENS.nightInk,
  labelSub: TOKENS.nightInk2,
} as const;
