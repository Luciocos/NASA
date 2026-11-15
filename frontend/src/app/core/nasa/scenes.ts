import type { PolygonGeometry } from '../models';
import { cmrPolygon } from './geo';
import type { NasaHttp } from './http';
import type { SatelliteScene, SceneList } from './models';

export const CMR_GRANULES = 'https://cmr.earthdata.nasa.gov/search/granules.json';

const SCENES_MAX_AGE_MS = 3 * 3_600_000;

export interface CmrEntry {
  title: string;
  time_start: string;
  cloud_cover?: string | number;
}

export interface CmrFeed {
  feed: { entry: CmrEntry[] };
}

export interface ScenesFetched {
  data: SceneList;
  stale: boolean;
  savedAt: string;
  /** true si alguna de las colecciones no respondió */
  incomplete: boolean;
}

interface Collection {
  query: string;
  mission: 'NISAR' | 'HLS';
  sensorLabel: string;
  maturity: 'provisional' | 'validada' | null;
}

const NISAR: Collection[] = [
  {
    query: 'short_name=NISAR_L2_GCOV_V1',
    mission: 'NISAR',
    sensorLabel: 'NISAR L-band radar (GCOV)',
    maturity: 'validada',
  },
  {
    query: 'short_name=NISAR_L2_GCOV_PROVISIONAL_V1',
    mission: 'NISAR',
    sensorLabel: 'NISAR L-band radar (GCOV)',
    maturity: 'provisional',
  },
];

const HLS: Collection[] = [
  {
    query: 'short_name=HLSS30&version=2.0',
    mission: 'HLS',
    sensorLabel: 'HLS Sentinel-2 (S30)',
    maturity: null,
  },
  {
    query: 'short_name=HLSL30&version=2.0',
    mission: 'HLS',
    sensorLabel: 'HLS Landsat (L30)',
    maturity: null,
  },
];

// NISAR_L2_PR_GCOV_<ciclo>_<track>_<A|D>_<frame>_...
const NISAR_TITLE = /_GCOV_(\d+)_(\d+)_([AD])_(\d+)_/;

export function parseScene(entry: CmrEntry, collection: Collection): SatelliteScene {
  const match = collection.mission === 'NISAR' ? NISAR_TITLE.exec(entry.title) : null;
  const cloud = entry.cloud_cover === undefined ? NaN : Number(entry.cloud_cover);
  return {
    mission: collection.mission,
    sensorLabel: collection.sensorLabel,
    start: entry.time_start,
    cloudCover: Number.isFinite(cloud) ? cloud : null,
    cycle: match?.[1] ?? null,
    track: match?.[2] ?? null,
    direction: match ? (match[3] === 'A' ? 'ascendente' : 'descendente') : null,
    frame: match?.[4] ?? null,
    maturity: collection.maturity,
    title: entry.title,
  };
}

/** escenas que cruzan un polígono, según el catálogo CMR de Earthdata */
export class SceneCatalog {
  constructor(private readonly http: NasaHttp) {}

  /** pasadas NISAR GCOV: provisionales y validadas */
  nisarScenes(geometry: PolygonGeometry): Promise<ScenesFetched> {
    return this.search(NISAR, geometry, '');
  }

  /** escenas HLS de Sentinel-2 y Landsat entre dos fechas, con su nubosidad */
  hlsScenes(geometry: PolygonGeometry, fromIso: string, toIso: string): Promise<ScenesFetched> {
    const temporal = `&temporal=${fromIso.slice(0, 10)}T00:00:00Z,${toIso.slice(0, 10)}T23:59:59Z`;
    return this.search(HLS, geometry, temporal);
  }

  private async search(
    collections: Collection[],
    geometry: PolygonGeometry,
    extra: string,
  ): Promise<ScenesFetched> {
    const polygon = cmrPolygon(geometry);
    const results = await Promise.allSettled(
      collections.map((c) =>
        this.http.get<CmrFeed>({
          url: `${CMR_GRANULES}?${c.query}&polygon=${polygon}${extra}&sort_key=-start_date&page_size=100`,
          service: 'cmr',
          maxAgeMs: SCENES_MAX_AGE_MS,
          keepHeaders: ['cmr-hits'],
        }),
      ),
    );
    const items: SatelliteScene[] = [];
    let total = 0;
    let stale = false;
    const saved: string[] = [];
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const entries = r.value.body.feed?.entry ?? [];
      items.push(...entries.map((e) => parseScene(e, collections[i])));
      total += Number(r.value.meta['cmr-hits'] ?? entries.length) || entries.length;
      stale ||= r.value.stale;
      saved.push(r.value.savedAt);
    });
    if (!saved.length) throw (results[0] as PromiseRejectedResult).reason;
    items.sort((a, b) => b.start.localeCompare(a.start));
    return {
      data: { items, total },
      stale,
      savedAt: saved.sort()[0],
      incomplete: saved.length < results.length,
    };
  }
}
