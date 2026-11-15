import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon/icon';
import { IconName } from '../../shared/ui/icon/icons';
import { DemoFallback, DemoVideo } from './demo-video/demo-video';
import { LandingDocs } from './landing-docs/landing-docs';

interface Step {
  icon: IconName;
  title: string;
  text: string;
}

export const LANDING_STEPS: readonly Step[] = [
  {
    icon: 'vertices',
    title: "Mark your field's boundary",
    text: 'Tap its corners on the satellite image. No spreadsheets.',
  },
  {
    icon: 'satellite',
    title: 'See NASA data, simplified',
    text: "Greenness, rainfall, soil moisture and your field's history.",
  },
  {
    icon: 'footprint',
    title: 'Check footprint, fertilization and profitability',
    text: 'These are estimates: every number shows where it comes from.',
  },
];

/**
 * imagen satelital real de la zona: teselas de NASA GIBS (HLS Landsat, L30, zoom 11) del
 * 31/10/2026, un día despejado, unidas en un solo archivo liviano sin retocar los colores. es el
 * fondo del cierre y ocupa el lugar del video si no carga. va sin texto de crédito a la vista: lo
 * que muestra lo dice el alt cuando reemplaza al video
 */
export const LANDING_IMAGE: DemoFallback = {
  src: '/zona-nucleo-landsat-800.webp',
  srcset: '/zona-nucleo-landsat-800.webp 800w, /zona-nucleo-landsat-1200.webp 1200w',
  alt: 'Satellite image of the farm fields between Casilda and Rosario, Argentina, with the Paraná River and its islands on the right',
};

/**
 * página de inicio pública, en inglés (lang="en" en el elemento raíz), para productores agrícolas,
 * ganaderos y asesores. arriba, el título y el recorrido en video como protagonista; una sola
 * acción principal: "Create a free account" (/registrarse), con "I already have an account"
 * (/ingresar) al lado y "See a sample field" como enlace chico. con la sesión abierta, "Go to my
 * fields". abajo, la documentación (landing-docs): cómo llega cada dato de la NASA y la tecnología
 * para escalar, con sus logos. no le pide nada al backend: el video y la imagen satelital son
 * archivos propios, y lo de abajo carga al acercarse
 */
@Component({
  selector: 'app-landing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, DemoVideo, LandingDocs],
  host: { lang: 'en' },
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css',
})
export class LandingPage {
  protected readonly steps = LANDING_STEPS;
  protected readonly image = LANDING_IMAGE;
  protected readonly loggedIn = inject(AuthService).loggedIn;
}
