import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Origin } from '../../../core/models';
import { OriginBadge } from '../../../shared/origin-badge/origin-badge';
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
    title: 'Desde el navegador',
    nodes: ['NASA, sin login', 'Navegador', 'Copia en el dispositivo', 'Pantalla'],
    note: 'MODIS, NASA POWER y CMR, por HTTPS y JSON. No pasan por el backend.',
  },
  {
    live: false,
    title: 'En Python: radar e hidrología',
    nodes: ['Earthdata, con login', 'Pipeline en Python', 'Django y PostgreSQL', 'App'],
    note: 'NISAR, HLS, IMERG, SMAP y MOD16, recortados a la zona del lote.',
  },
];

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
export const FLOW_LABELS = ['De dónde sale', 'Cómo llega', 'En la app'] as const;

/**
 * documentación: cómo llega cada dato de la NASA a la app, sacado del código (core/nasa, pipeline,
 * events/importer y hydrology) y de INFO.md, sección 3
 */
export const LANDING_NASA: readonly NasaSource[] = [
  {
    id: 'nisar',
    icon: 'satellite',
    tab: 'NISAR',
    name: 'NISAR · radar banda L',
    what: 'Ve labores como la siembra aunque haya nubes.',
    live: false,
    steps: [
      { text: 'ASF DAAC, en Earthdata', tags: ['NISAR L2 GCOV', 'HDF5'] },
      {
        text: 'Python lee solo el lote y el backend lo importa',
        tags: ['Earthdata Login', 'HTTP por rangos', 'import_events'],
      },
      { text: 'La siembra, con radar contra óptico', tags: ['Bitácora'], origin: 'VERIFIED' },
    ],
  },
  {
    id: 'hls',
    icon: 'eye',
    tab: 'HLS',
    name: 'HLS · Landsat y Sentinel-2',
    what: 'Confirma con el verdor óptico lo que vio el radar.',
    live: false,
    steps: [
      { text: 'LP DAAC, en Earthdata', tags: ['HLS L30 y S30', 'COG'] },
      {
        text: 'Python busca la escena, saca nubes y lo importa',
        tags: ['STAC', 'Earthdata Login', 'import_events'],
      },
      { text: 'La foto óptica y el verdor del evento', tags: ['Bitácora'], origin: 'VERIFIED' },
    ],
  },
  {
    id: 'modis',
    icon: 'leaf',
    tab: 'MODIS',
    name: 'MODIS · NDVI y cobertura',
    what: 'Verdor, ambientes y uso del suelo desde 2020.',
    live: true,
    steps: [
      { text: 'ORNL DAAC, servicio web de MODIS', tags: ['MOD13Q1 · NDVI', 'MCD12Q1 · cobertura'] },
      {
        text: 'El navegador pide los píxeles del lote',
        tags: ['API REST', 'HTTPS · JSON', 'Copia en el dispositivo'],
      },
      {
        text: 'Verdor, ambientes y uso del suelo',
        tags: ['Satélite', 'Mi campo', 'Fertilización', 'Prácticas'],
        origin: 'VERIFIED',
      },
    ],
  },
  {
    id: 'power',
    icon: 'cloud',
    tab: 'NASA POWER',
    name: 'NASA POWER',
    what: 'Lluvia y humedad del suelo de la zona.',
    live: true,
    steps: [
      {
        text: 'El reanálisis diario de POWER',
        tags: ['MERRA-2 y GEOS-IT', 'Grilla de unos 50 km'],
      },
      {
        text: 'El navegador pide el clima del centro del lote',
        tags: ['API REST', 'HTTPS · JSON', 'Copia en el dispositivo'],
      },
      { text: 'Lluvia de 30 días y humedad del suelo', tags: ['Satélite'], origin: 'ESTIMATED' },
    ],
  },
  {
    id: 'cmr',
    icon: 'search',
    tab: 'CMR',
    name: 'CMR de Earthdata',
    what: 'Qué pasadas de NISAR y HLS cubren el lote.',
    live: true,
    steps: [
      { text: 'El catálogo de Earthdata', tags: ['Search API', 'Sin login'] },
      {
        text: 'El navegador busca con el polígono del lote',
        tags: ['HTTPS · JSON', 'Sin bajar imágenes', 'Copia de 3 h'],
      },
      { text: 'Pasadas de NISAR e imágenes HLS', tags: ['Satélite'], note: 'Solo un listado' },
    ],
  },
  {
    id: 'hydrology',
    icon: 'water',
    tab: 'IMERG · SMAP · MOD16',
    name: 'GPM IMERG, SMAP y MOD16',
    what: 'Lluvia, humedad y evapotranspiración para Cuenca y Caudal.',
    live: false,
    steps: [
      { text: 'GES DISC, NSIDC y ORNL DAAC', tags: ['IMERG V07', 'SMAP L3', 'MOD16'] },
      {
        text: 'Python guarda forcing.json y Django lo lee',
        tags: ['Earthdata Login', 'OPeNDAP', 'API REST'],
      },
      {
        text: 'Lluvias desde 2020, humedad y evapotranspiración',
        tags: ['Cuenca y Caudal'],
        note: 'Modelo sin validar',
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
    why: 'Se instala en el celular o la compu y es rápida en cualquier pantalla.',
  },
  {
    logos: [TECH_LOGOS.cloudflare],
    name: 'Cloudflare Workers',
    why: 'Sirve la app desde el borde, cerca de cada usuario, y escala sola.',
  },
  {
    logos: [TECH_LOGOS.railway, TECH_LOGOS.githubActions],
    name: 'Railway + GitHub Actions',
    why: 'Backend en contenedores, publicado solo en cada cambio.',
  },
  {
    logos: [TECH_LOGOS.postgresql],
    name: 'PostgreSQL',
    why: 'Los datos de cada productor, privados y consistentes.',
  },
  {
    logos: [TECH_LOGOS.python, TECH_LOGOS.django],
    name: 'Python · Django y DRF',
    why: 'API y cuentas en el mismo lenguaje del análisis satelital.',
  },
  {
    logos: [TECH_LOGOS.python, TECH_LOGOS.numpy],
    name: 'Pipeline en Python',
    why: 'Lo pesado (radar e hidrología) corre aparte: la app responde rápido.',
  },
];

/**
 * documentación de la landing: arriba, los dos caminos por los que llegan los datos de la NASA;
 * después, una pestaña por fuente con su recorrido en tres pasos (de dónde sale, cómo llega y
 * dónde se ve), y abajo la tecnología con sus logos. las fuentes de la NASA llevan los íconos de la
 * app, nunca un logo de la NASA o de una misión. no le pide nada a nadie: todo viene en el código
 *
 * @example <app-landing-docs />
 */
@Component({
  selector: 'app-landing-docs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, OriginBadge],
  templateUrl: './landing-docs.html',
  styleUrl: './landing-docs.css',
})
export class LandingDocs {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly paths = LANDING_PATHS;
  protected readonly nasa = LANDING_NASA;
  protected readonly stack = LANDING_STACK;
  protected readonly labels = FLOW_LABELS;
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
