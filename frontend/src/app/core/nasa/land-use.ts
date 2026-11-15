import type { PolygonGeometry } from '../models';
import { centroid, pointInPolygon, round } from './geo';
import type { DataSourceInfo } from './models';
import {
  type LandCoverGrid,
  type LandCoverGridYear,
  type SubsetGrid,
  cellAt,
  cellCenter,
} from './modis';
import { DATA_SOURCES, IGBP_LABELS } from './sources';

/** año base del criterio "sin cambio de uso del suelo desde 2020" */
export const LAND_USE_BASELINE_YEAR = 2020;

/**
 * desde esta parte de los píxeles del lote con un uso distinto del que tenía cada uno en el año
 * base, ese año cuenta como posible cambio aunque el uso dominante siga igual: así un desmonte de
 * un tercio del lote no pasa como "sin cambio". menos que eso solo se cuenta en el texto, porque
 * un píxel suelto que cambia un año suele ser un error de clasificación
 */
export const LAND_USE_CHANGED_SHARE = 0.25;

export type LandUseGroup = 'agricultural' | 'natural' | 'urban' | 'other';

/** nombre corto de cada grupo para la interfaz */
export const LAND_USE_GROUP_LABELS: Record<LandUseGroup, string> = {
  agricultural: 'Agrícola',
  natural: 'Natural',
  urban: 'Urbano',
  other: 'Agua, nieve o suelo desnudo',
};

/** lo que vio MODIS en los píxeles del lote en un año */
export interface LandUseYear {
  year: number;
  /** grupo más frecuente entre los píxeles con dato; null si hay empate o no hay dato */
  group: LandUseGroup | null;
  /**
   * clase IGBP más frecuente (1 a 17); si empatan, la del grupo dominante y después la de menor
   * número. null sin dato
   */
  classId: number | null;
  classLabel: string | null;
  /** píxeles del lote con una clase válida ese año */
  pixels: number;
  /** parte de esos píxeles con uso agrícola (cultivo o mosaico), de 0 a 1; null sin dato */
  agriculturalShare: number | null;
}

/** la fuente del dato, como las de DATA_SOURCES, con la fecha de la consulta */
export interface LandUseSource extends DataSourceInfo {
  /** cuándo llegó de la red la clasificación que se usó (ISO); si es una copia guardada, su fecha */
  retrievedAt: string;
}

/** uso del suelo del lote desde el año base según MODIS: orientativo por el tamaño del píxel */
export interface LandUseEvidence {
  verdict: 'unchanged' | 'possible_change' | 'no_data';
  baselineYear: number;
  /** último año con dato; null si no hay ninguno */
  lastYear: number | null;
  /** del año base en adelante, también los que vinieron sin dato (pixels 0) */
  years: LandUseYear[];
  /** píxeles del lote: los de centro adentro, o 1 si se usó el que contiene el centroide */
  pixelCount: number;
  pixelSizeM: number;
  /** true si ningún centro de píxel cae dentro del lote y se usó el que contiene el centroide */
  centroidFallback: boolean;
  /** explicación para el productor, en castellano llano */
  reason: string;
  source: LandUseSource;
  origin: 'VERIFIED';
}

/** lo que necesita el cálculo: las clases de los píxeles del lote, año por año */
export interface LandUseInput {
  years: LandCoverGridYear[];
  baselineYear: number;
  pixelCount: number;
  pixelSizeM: number;
  centroidFallback: boolean;
  /** true si el lote no entró entero en la ventana consultada */
  clipped?: boolean;
  /** cuándo llegó de la red la clasificación (ISO) */
  retrievedAt: string;
}

/**
 * grupo de uso de una clase IGBP. cultivo (12) y mosaico de cultivo con vegetación natural (14)
 * van juntos: en la pampa la clasificación salta entre los dos sin que cambie nada
 */
export function landUseGroup(classId: number | null): LandUseGroup | null {
  if (classId === null || !Number.isInteger(classId)) return null;
  if (classId === 12 || classId === 14) return 'agricultural';
  if (classId >= 1 && classId <= 11) return 'natural';
  if (classId === 13) return 'urban';
  if (classId >= 15 && classId <= 17) return 'other';
  return null;
}

/**
 * píxeles del lote en la grilla: los que tienen el centro dentro del polígono (respetando
 * huecos); si no cae ninguno, el que contiene el centroide, con centroidFallback true
 */
export function lotPixelIndexes(
  grid: SubsetGrid,
  geometry: PolygonGeometry,
): { indexes: number[]; centroidFallback: boolean } {
  const indexes: number[] = [];
  for (let i = 0; i < grid.nrows * grid.ncols; i++) {
    if (pointInPolygon(cellCenter(grid, i), geometry)) indexes.push(i);
  }
  if (indexes.length) return { indexes, centroidFallback: false };
  const at = cellAt(grid, centroid(geometry));
  return { indexes: at === null ? [] : [at], centroidFallback: true };
}

/** evidencia de uso del suelo de un lote a partir de la grilla de cobertura de su ventana */
export function lotLandUse(
  grid: LandCoverGrid,
  geometry: PolygonGeometry,
  options: { retrievedAt: string; baselineYear?: number; clipped?: boolean },
): LandUseEvidence {
  const { indexes, centroidFallback } = lotPixelIndexes(grid, geometry);
  return landUseEvidence({
    years: grid.years.map((y) => ({
      year: y.year,
      classes: indexes.map((i) => y.classes[i] ?? null),
    })),
    baselineYear: options.baselineYear ?? LAND_USE_BASELINE_YEAR,
    pixelCount: indexes.length,
    pixelSizeM: grid.cellSizeM,
    centroidFallback,
    clipped: options.clipped,
    retrievedAt: options.retrievedAt,
  });
}

interface YearStats {
  summary: LandUseYear;
  /** grupo de cada píxel del lote ese año, en el orden de los píxeles; null sin dato */
  groups: (LandUseGroup | null)[];
  classCounts: Map<number, number>;
  groupCounts: Map<LandUseGroup, number>;
}

interface PixelChanges {
  /** píxeles con dato en el año base y en el otro año */
  compared: number;
  /** grupo en el año base y en el otro año de cada píxel que cambió */
  from: LandUseGroup[];
  to: LandUseGroup[];
}

/** cada píxel del lote frente a sí mismo en el año base */
function pixelChanges(base: YearStats, other: YearStats): PixelChanges {
  const changes: PixelChanges = { compared: 0, from: [], to: [] };
  base.groups.forEach((before, i) => {
    const after = other.groups[i] ?? null;
    if (before === null || after === null) return;
    changes.compared++;
    if (after === before) return;
    changes.from.push(before);
    changes.to.push(after);
  });
  return changes;
}

/** el grupo que más se repite, o null si empatan o no hay */
function mostCommon(groups: LandUseGroup[]): LandUseGroup | null {
  const counts = new Map<LandUseGroup, number>();
  for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  const top = leaders(counts);
  return top.length === 1 ? top[0] : null;
}

/** claves con la cuenta más alta, en orden estable */
function leaders<K extends string | number>(counts: Map<K, number>): K[] {
  const max = Math.max(0, ...counts.values());
  return [...counts.entries()]
    .filter(([, n]) => n === max && n > 0)
    .map(([key]) => key)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** la clase más frecuente; si empatan, la del grupo dominante y después la de menor número */
function dominantClass(counts: Map<number, number>, group: LandUseGroup | null): number | null {
  const tied = leaders(counts);
  return tied.find((id) => landUseGroup(id) === group) ?? tied[0] ?? null;
}

function summarizeYear({ year, classes }: LandCoverGridYear): YearStats {
  const classCounts = new Map<number, number>();
  const groupCounts = new Map<LandUseGroup, number>();
  for (const id of classes) {
    const group = landUseGroup(id);
    if (id === null || group === null) continue;
    classCounts.set(id, (classCounts.get(id) ?? 0) + 1);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  }
  const pixels = [...classCounts.values()].reduce((s, n) => s + n, 0);
  const topGroups = leaders(groupCounts);
  const group = topGroups.length === 1 ? topGroups[0] : null;
  const classId = dominantClass(classCounts, group);
  return {
    summary: {
      year,
      group,
      classId,
      classLabel: classId === null ? null : IGBP_LABELS[classId],
      pixels,
      agriculturalShare: pixels ? round((groupCounts.get('agricultural') ?? 0) / pixels, 2) : null,
    },
    groups: classes.map(landUseGroup),
    classCounts,
    groupCounts,
  };
}

const GROUP_NOUN: Record<LandUseGroup, string> = {
  agricultural: 'uso agrícola',
  natural: 'vegetación natural',
  urban: 'área urbana',
  other: 'agua, nieve o suelo desnudo',
};

/** "a", "a y b", "a, b y c" */
function joinList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

/** lo que vio MODIS un año, para una frase: "vegetación natural (pastizal)", "uso agrícola" */
function describeYear({ summary, classCounts, groupCounts }: YearStats): string {
  const { group } = summary;
  if (group === null) {
    return `${joinList(leaders(groupCounts).map((g) => GROUP_NOUN[g]))} en partes iguales`;
  }
  if (group === 'agricultural' || group === 'urban') return GROUP_NOUN[group];
  const inGroup = new Map([...classCounts].filter(([id]) => landUseGroup(id) === group));
  const top = leaders(inGroup)[0];
  const label = top === undefined ? GROUP_NOUN[group] : IGBP_LABELS[top].toLowerCase();
  return group === 'natural' ? `vegetación natural (${label})` : label;
}

/**
 * evidencia de uso del suelo desde el año base, a partir de las clases de los píxeles del lote
 * por año se toman la clase y el grupo más frecuentes. unchanged si el grupo dominante es el mismo
 * desde el año base hasta el último año con dato y ningún año cambió de grupo una cuarta parte de
 * los píxeles (cada uno frente a sí mismo en el año base); possible_change si el dominante cambia
 * (o empata) o si cambia esa parte del lote algún año; no_data si falta el año base, si no hay
 * píxeles con dato o si no hay otro año para comparar
 */
export function landUseEvidence(input: LandUseInput): LandUseEvidence {
  const stats = input.years
    .filter((y) => y.year >= input.baselineYear)
    .sort((a, b) => a.year - b.year)
    .map(summarizeYear);
  const withData = stats.filter((s) => s.summary.pixels > 0);
  const base = withData.find((s) => s.summary.year === input.baselineYear);
  const later = withData.filter((s) => s.summary.year > input.baselineYear);
  const lastYear = withData.at(-1)?.summary.year ?? null;
  const size = Math.round(input.pixelSizeM / 10) * 10;
  const fallbackNote = `Ningún píxel tiene su centro dentro de tu lote, así que se usó el de unos ${size} m que contiene el centro del lote: el dato también abarca lo que lo rodea.`;
  const notes: string[] = [];
  if (input.clipped) {
    notes.push('Tu lote es más grande que la zona consultada: se leyó solo su parte central.');
  }

  let verdict: LandUseEvidence['verdict'];
  let reason: string;
  if (!input.pixelCount) {
    verdict = 'no_data';
    reason = 'No hay píxeles de MODIS sobre tu lote.';
  } else if (!withData.length) {
    verdict = 'no_data';
    reason = 'MODIS no tiene una clasificación válida para los píxeles de tu lote.';
  } else if (!base) {
    verdict = 'no_data';
    reason = `MODIS no tiene la clasificación de ${input.baselineYear} para tu lote: sin el año base no hay con qué comparar.`;
  } else if (!later.length) {
    verdict = 'no_data';
    reason = `MODIS solo tiene la clasificación de ${input.baselineYear}: falta un año posterior para comparar.`;
  } else if (base.summary.group === null) {
    verdict = 'possible_change';
    reason = `En ${input.baselineYear} MODIS vio ${describeYear(base)}, así que no se puede confirmar que el uso siguió igual. Conviene revisarlo.`;
  } else {
    const group = base.summary.group;
    // cada píxel frente a sí mismo en el año base: un cambio en parte del lote no mueve el dominante
    const changes = later.map((year) => ({ stats: year, ...pixelChanges(base, year) }));
    const changed = changes.find(
      ({ stats, compared, to }) =>
        stats.summary.group !== group ||
        (compared > 0 && to.length / compared >= LAND_USE_CHANGED_SHARE),
    );
    if (changed && changed.stats.summary.group !== group) {
      verdict = 'possible_change';
      reason = `En ${input.baselineYear} MODIS vio ${describeYear(base)} y en ${changed.stats.summary.year}, ${describeYear(changed.stats)}: puede ser un cambio de uso del suelo o un error de clasificación. Conviene revisarlo.`;
    } else if (changed) {
      verdict = 'possible_change';
      const to = mostCommon(changed.to);
      const from = mostCommon(changed.from);
      const part = `${changed.to.length} de los ${changed.compared} píxeles de tu lote`;
      const seen =
        to && from
          ? `${GROUP_NOUN[to]} en ${part}, donde en ${input.baselineYear} había visto ${GROUP_NOUN[from]}`
          : `un uso distinto del de ${input.baselineYear} en ${part}`;
      reason = `En ${changed.stats.summary.year} MODIS vio ${seen}: puede ser un cambio de uso del suelo en parte del lote o un error de clasificación. Conviene revisarlo.`;
    } else {
      // algún píxel cambió, pero ningún año en una cuarta parte del lote (LAND_USE_CHANGED_SHARE)
      const most = Math.max(0, ...changes.map((c) => c.to.length));
      if (most) {
        notes.unshift(
          `Algún año vio otro uso en ${most} de los ${input.pixelCount} píxeles, menos de una cuarta parte del lote: puede ser un error de clasificación.`,
        );
      }
      verdict = 'unchanged';
      const missing: number[] = [];
      for (let year = input.baselineYear + 1; year < (lastYear ?? 0); year++) {
        if (!withData.some((s) => s.summary.year === year)) missing.push(year);
      }
      const span = missing.length
        ? `todos los años con dato de ${input.baselineYear} a ${lastYear} (sin dato en ${joinList(missing.map(String))})`
        : `todos los años de ${input.baselineYear} a ${lastYear}`;
      // el uso dominante no siempre está en todos los píxeles: se dice en cuántos lo vio
      const counts = [base, ...later].map((s) => s.groupCounts.get(group) ?? 0);
      const least = Math.min(...counts);
      const some = counts.every((n) => n === least) ? `${least}` : `al menos ${least}`;
      const where = input.centroidFallback
        ? `el píxel de unos ${size} m que contiene el centro de tu lote. Como ningún píxel tiene su centro adentro, el dato también abarca lo que lo rodea`
        : input.pixelCount === 1
          ? `el único píxel de unos ${size} m con su centro dentro de tu lote`
          : least === input.pixelCount
            ? `los ${input.pixelCount} píxeles de unos ${size} m que cubren tu lote`
            : `${some} de los ${input.pixelCount} píxeles de unos ${size} m que cubren tu lote`;
      reason = `MODIS vio ${GROUP_NOUN[group]} ${span} en ${where}.`;
    }
  }
  if (verdict !== 'unchanged' && input.centroidFallback && input.pixelCount) {
    notes.unshift(fallbackNote);
  }

  return {
    verdict,
    baselineYear: input.baselineYear,
    lastYear,
    years: stats.map((s) => s.summary),
    pixelCount: input.pixelCount,
    pixelSizeM: input.pixelSizeM,
    centroidFallback: input.centroidFallback,
    reason: [reason, ...notes].join(' '),
    source: { ...DATA_SOURCES.modisLandUse, retrievedAt: input.retrievedAt },
    origin: 'VERIFIED',
  };
}
