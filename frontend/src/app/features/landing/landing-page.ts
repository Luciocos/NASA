import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon/icon';
import { IconName } from '../../shared/ui/icon/icons';

interface Step {
  icon: IconName;
  title: string;
  text: string;
}

interface Place {
  name: string;
  /** posición en la imagen, en % del ancho y del alto */
  left: number;
  top: number;
  /** la etiqueta va a la izquierda del punto, para no salirse del borde derecho */
  labelBefore?: boolean;
}

export const LANDING_STEPS: readonly Step[] = [
  {
    icon: 'vertices',
    title: 'Marcá el perímetro de tu lote sobre la imagen satelital',
    text: 'Tocá sus esquinas en el mapa y listo: no hace falta cargar planillas.',
  },
  {
    icon: 'satellite',
    title: 'Mirá lo que ve el satélite',
    text: 'El verdor del cultivo, la lluvia y la humedad del suelo de tu lote, con datos abiertos de la NASA.',
  },
  {
    icon: 'footprint',
    title: 'Conocé tu huella, fertilización y rentabilidad',
    text: 'Son estimaciones y cada número dice de dónde sale: del satélite, de lo que declaraste o de una referencia.',
  },
];

/**
 * imagen satelital real del encabezado: teselas de NASA GIBS (HLS Landsat, L30, zoom 11) del
 * 31/10/2026, un día despejado, unidas en un solo archivo liviano sin retocar los colores. las
 * posiciones de Casilda y Rosario salen de proyectar sus coordenadas sobre ese recorte
 */
export const LANDING_IMAGE = {
  src: '/zona-nucleo-landsat-800.webp',
  srcset: '/zona-nucleo-landsat-800.webp 800w, /zona-nucleo-landsat-1200.webp 1200w',
  alt: 'Imagen satelital de los campos de la Zona Núcleo entre Casilda y Rosario, con el río Paraná y sus islas a la derecha',
  caption:
    'Campos entre Casilda y Rosario vistos por Landsat el 31/10/2026. Imagen HLS de la NASA, de NASA EOSDIS GIBS.',
  places: [
    { name: 'Casilda', left: 36.6, top: 58.5 },
    { name: 'Rosario', left: 84.7, top: 41.6, labelBefore: true },
  ] satisfies Place[],
};

/** la infografía de los datos de la NASA, más abajo y con carga diferida */
export const LANDING_INFOGRAPHIC = {
  src: '/lotestigo-datos-nasa.jpg',
  alt: 'Infografía de cómo LoTestigo usa los datos abiertos de la NASA: qué datos toma (NISAR, HLS, MODIS, NASA POWER, CMR y GIBS), cómo llegan a la app y para qué le sirven al productor (bitácora, Mi campo, fertilización, huella, puntaje y rentabilidad).',
};

/**
 * página de inicio pública. una sola acción principal: "Crear cuenta gratis" (/registrarse),
 * con "Ya tengo cuenta" (/ingresar) al lado y "Ver un lote de ejemplo" como enlace chico. con la
 * sesión abierta, "Ir a mi campo". no pide nada a la red: la imagen satelital es un archivo
 * propio y la infografía carga recién al acercarse
 */
@Component({
  selector: 'app-landing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css',
})
export class LandingPage {
  protected readonly steps = LANDING_STEPS;
  protected readonly image = LANDING_IMAGE;
  protected readonly infographic = LANDING_INFOGRAPHIC;
  protected readonly loggedIn = inject(AuthService).loggedIn;
}
