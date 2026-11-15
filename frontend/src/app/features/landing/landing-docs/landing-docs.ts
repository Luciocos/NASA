import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Origin } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icons';
import { TECH_LOGOS, TechLogo } from './tech-logos';

/** uno de los dos caminos por los que llegan los datos de la NASA */
interface DataPath {
  live: boolean;
  title: string;
  /** de punta a punta, con flechas entre uno y otro */
  nodes: readonly string[];
  /** qué fuentes van por acá, en una línea */
  note: string;
}

/** los dos caminos (INFO.md, sección 3): en vivo desde el navegador o procesado aparte */
export const LANDING_PATHS: readonly DataPath[] = [
  {
    live: true,
    title: 'From the browser',
    nodes: ['NASA, no login', 'Browser', 'Saved on the device', 'Screen'],
    note: "MODIS, NASA POWER and CMR, over HTTPS and JSON. They don't go through the backend.",
  },
  {
    live: false,
    title: 'In Python: radar and hydrology',
    nodes: ['Earthdata, with login', 'Python pipeline', 'Django and PostgreSQL', 'App'],
    note: "NISAR, HLS, IMERG, SMAP and MOD16, clipped to the field's area.",
  },
];

/** la ficha de cada camino: en vivo desde el navegador o procesado aparte en el pipeline */
export const PATH_LABELS = { live: 'Live', processed: 'Pre-processed' } as const;

/**
 * el origen con el que la app muestra el dato, en inglés como el resto de la landing. es la misma
 * etiqueta (y los mismos colores) que origin-badge, que en la app va en español
 */
export const ORIGIN_LABELS_EN: Readonly<Record<Origin, string>> = {
  VERIFIED: 'Verified',
  DECLARED: 'Declared',
  ESTIMATED: 'Estimated',
};

/** un paso del recorrido de un dato: una línea corta y lo técnico en fichas */
interface FlowStep {
  text: string;
  /** servicio, protocolo y formato; en el último paso, dónde se ve en la app */
  tags: readonly string[];
  /** con qué origen lo muestra la app (solo el último paso) */
  origin?: Origin;
  /** en lugar del origen, por qué no lleva uno */
  note?: string;
}

export interface NasaSource {
  /** arma los ids de la pestaña y de su panel */
  id: string;
  icon: IconName;
  /** nombre corto, para la pestaña */
  tab: string;
  name: string;
  /** para qué le sirve al productor, en una línea */
  what: string;
  /** en vivo desde el navegador o procesado aparte en el pipeline */
  live: boolean;
  /** de dónde sale, cómo llega y qué muestra la app */
  steps: readonly [FlowStep, FlowStep, FlowStep];
}

/** el nombre de cada paso del recorrido, en orden */
export const FLOW_LABELS = ['Where it comes from', 'How it arrives', 'In the app'] as const;

/**
 * documentación: cómo llega cada dato de la NASA a la app, sacado del código (core/nasa, pipeline,
 * events/importer y hydrology) y de INFO.md, sección 3. las pantallas de la app van con su nombre
 * en inglés: Satellite (Satélite), Field log (Bitácora), My fields (Mi campo), Practices
 * (Prácticas), Fertilization (Fertilización) y Watershed (Cuenca y Caudal)
 */
export const LANDING_NASA: readonly NasaSource[] = [
  {
    id: 'nisar',
    icon: 'satellite',
    tab: 'NISAR',
    name: 'NISAR · L-band radar',
    what: 'Sees field work like sowing, even through clouds.',
    live: false,
    steps: [
      { text: 'ASF DAAC, on Earthdata', tags: ['NISAR L2 GCOV', 'HDF5'] },
      {
        text: 'Python reads only the field; Django imports it',
        tags: ['Earthdata Login', 'HTTP range requests', 'import_events'],
      },
      { text: 'Sowing, with radar vs. optical', tags: ['Field log'], origin: 'VERIFIED' },
    ],
  },
  {
    id: 'hls',
    icon: 'eye',
    tab: 'HLS',
    name: 'HLS · Landsat and Sentinel-2',
    what: 'Confirms what the radar saw with optical greenness.',
    live: false,
    steps: [
      { text: 'LP DAAC, on Earthdata', tags: ['HLS L30 and S30', 'COG'] },
      {
        text: 'Python finds the scene, masks clouds, imports it',
        tags: ['STAC', 'Earthdata Login', 'import_events'],
      },
      {
        text: 'Optical image and greenness for the event',
        tags: ['Field log'],
        origin: 'VERIFIED',
      },
    ],
  },
  {
    id: 'modis',
    icon: 'leaf',
    tab: 'MODIS',
    name: 'MODIS · NDVI and land cover',
    what: 'Greenness, management zones and land use since 2020.',
    live: true,
    steps: [
      {
        text: 'ORNL DAAC, MODIS web service',
        tags: ['MOD13Q1 · NDVI', 'MCD12Q1 · land cover'],
      },
      {
        text: "The browser requests the field's pixels",
        tags: ['REST API', 'HTTPS · JSON', 'Saved on the device'],
      },
      {
        text: 'Greenness, zones and land use',
        tags: ['Satellite', 'My fields', 'Fertilization', 'Practices'],
        origin: 'VERIFIED',
      },
    ],
  },
  {
    id: 'power',
    icon: 'cloud',
    tab: 'NASA POWER',
    name: 'NASA POWER',
    what: 'Rainfall and soil moisture for the area.',
    live: true,
    steps: [
      {
        text: "POWER's daily reanalysis",
        tags: ['MERRA-2 and GEOS-IT', 'About a 50 km grid'],
      },
      {
        text: "The browser gets weather for the field's center",
        tags: ['REST API', 'HTTPS · JSON', 'Saved on the device'],
      },
      { text: '30-day rainfall and soil moisture', tags: ['Satellite'], origin: 'ESTIMATED' },
    ],
  },
  {
    id: 'cmr',
    icon: 'search',
    tab: 'CMR',
    name: 'Earthdata CMR',
    what: 'Which NISAR passes and HLS scenes cover the field.',
    live: true,
    steps: [
      { text: 'The Earthdata catalog', tags: ['Search API', 'No login'] },
      {
        text: "The browser searches with the field's polygon",
        tags: ['HTTPS · JSON', 'No image downloads', 'Saved for 3 hours'],
      },
      { text: 'NISAR passes and HLS images', tags: ['Satellite'], note: 'List only' },
    ],
  },
  {
    id: 'hydrology',
    icon: 'water',
    tab: 'IMERG · SMAP · MOD16',
    name: 'GPM IMERG, SMAP and MOD16',
    what: 'Rainfall, soil moisture and evapotranspiration for the Watershed tab.',
    live: false,
    steps: [
      { text: 'GES DISC, NSIDC and ORNL DAAC', tags: ['IMERG V07', 'SMAP L3', 'MOD16'] },
      {
        text: 'Python saves forcing.json and Django reads it',
        tags: ['Earthdata Login', 'OPeNDAP', 'REST API'],
      },
      {
        text: 'Rain since 2020, moisture and evapotranspiration',
        tags: ['Watershed'],
        note: 'Unvalidated model',
      },
    ],
  },
];

interface StackTool {
  logos: readonly TechLogo[];
  name: string;
  /** por qué lo usamos, en una línea */
  why: string;
}

/** documentación: la tecnología, con sus logos, y por qué la elegimos para escalar */
export const LANDING_STACK: readonly StackTool[] = [
  {
    logos: [TECH_LOGOS.angular, TECH_LOGOS.pwa],
    name: 'Angular 22 · PWA',
    why: 'Installs on a phone or computer and runs fast on any screen.',
  },
  {
    logos: [TECH_LOGOS.cloudflare],
    name: 'Cloudflare Workers',
    why: 'Serves the app from the edge, close to every user, and scales on its own.',
  },
  {
    logos: [TECH_LOGOS.railway, TECH_LOGOS.githubActions],
    name: 'Railway + GitHub Actions',
    why: 'Containerized backend, deployed automatically on every change.',
  },
  {
    logos: [TECH_LOGOS.postgresql],
    name: 'PostgreSQL',
    why: "Each farmer's data, private and consistent.",
  },
  {
    logos: [TECH_LOGOS.python, TECH_LOGOS.django],
    name: 'Python · Django and DRF',
    why: 'API and accounts in the same language as the satellite analysis.',
  },
  {
    logos: [TECH_LOGOS.python, TECH_LOGOS.numpy],
    name: 'Python pipeline',
    why: 'Heavy work (radar and hydrology) runs separately, so the app stays fast.',
  },
];

/**
 * documentación de la landing, en inglés: arriba, los dos caminos por los que llegan los datos de
 * la NASA; después, una pestaña por fuente con su recorrido en tres pasos (de dónde sale, cómo
 * llega y dónde se ve), y abajo la tecnología con sus logos. el origen del último paso va con la
 * etiqueta en inglés (ORIGIN_LABELS_EN) y los colores de origin-badge. las fuentes de la NASA
 * llevan los íconos de la app, nunca un logo de la NASA o de una misión. no le pide nada a nadie:
 * todo viene en el código
 *
 * @example <app-landing-docs />
 */
@Component({
  selector: 'app-landing-docs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  templateUrl: './landing-docs.html',
  styleUrl: './landing-docs.css',
})
export class LandingDocs {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly paths = LANDING_PATHS;
  protected readonly nasa = LANDING_NASA;
  protected readonly stack = LANDING_STACK;
  protected readonly labels = FLOW_LABELS;
  protected readonly pathLabels = PATH_LABELS;
  protected readonly origins = ORIGIN_LABELS_EN;
  /** la fuente a la vista: arranca en NISAR, el sensor principal */
  protected readonly selected = signal(LANDING_NASA[0].id);

  /** flechas, Inicio y Fin recorren las fuentes (pestañas con activación automática, como la huella) */
  protected onTabKey(event: KeyboardEvent): void {
    const ids = this.nasa.map((source) => source.id);
    const current = ids.indexOf(this.selected());
    const next =
      event.key === 'ArrowRight'
        ? (current + 1) % ids.length
        : event.key === 'ArrowLeft'
          ? (current - 1 + ids.length) % ids.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? ids.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    this.selected.set(ids[next]);
    this.host.nativeElement.querySelector<HTMLElement>(`#docs-tab-${ids[next]}`)?.focus();
  }
}
