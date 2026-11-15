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
    title: 'Marcá el perímetro del lote',
    text: 'Tocá sus esquinas sobre la imagen satelital. Sin planillas.',
  },
  {
    icon: 'satellite',
    title: 'Mirá los datos de la NASA, simplificados',
    text: 'Verdor, lluvia, humedad del suelo y la historia del lote.',
  },
  {
    icon: 'footprint',
    title: 'Conocé huella, fertilización y rentabilidad',
    text: 'Son estimaciones: cada número dice de dónde sale.',
  },
];

/**
 * imagen satelital real de la zona: teselas de NASA GIBS (HLS Landsat, L30, zoom 11) del
 * 31/10/2026, un día despejado, unidas en un solo archivo liviano sin retocar los colores. es el
 * fondo del cierre y ocupa el lugar del video si no carga
 */
export const LANDING_IMAGE: DemoFallback = {
  src: '/zona-nucleo-landsat-800.webp',
  srcset: '/zona-nucleo-landsat-800.webp 800w, /zona-nucleo-landsat-1200.webp 1200w',
  alt: 'Imagen satelital de los campos de la Zona Núcleo entre Casilda y Rosario, con el río Paraná y sus islas a la derecha',
  caption: 'Casilda y Rosario vistos por Landsat el 31/10/2026 (HLS, NASA EOSDIS GIBS).',
};

/**
 * página de inicio pública, para productores agrícolas, ganaderos y asesores. arriba, el título
 * y el recorrido en video como protagonista; una sola acción principal: "Crear cuenta gratis"
 * (/registrarse), con "Ya tengo cuenta" (/ingresar) al lado y "Ver un lote de ejemplo" como
 * enlace chico. con la sesión abierta, "Ir a mi campo". abajo, la documentación (landing-docs):
 * cómo llega cada dato de la NASA y la tecnología para escalar, con sus logos. no le pide nada al
 * backend: el video y la imagen satelital son archivos propios, y lo de abajo carga al acercarse
 */
@Component({
  selector: 'app-landing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, DemoVideo, LandingDocs],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css',
})
export class LandingPage {
  protected readonly steps = LANDING_STEPS;
  protected readonly image = LANDING_IMAGE;
  protected readonly loggedIn = inject(AuthService).loggedIn;
}
