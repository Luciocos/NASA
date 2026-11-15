import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { DemoAccount } from '../../core/account/demo-account';
import { isExampleLot } from '../../core/account/examples';
import { Api } from '../../core/api';
import { buildIsoScene, overviewsSignal } from '../../core/lot-scene';
import { formatDate } from '../lot/labels';
import { OriginBadge } from '../../shared/origin-badge/origin-badge';
import { EventGlyph } from '../../shared/iso/event-glyph';
import { IsoScene } from '../../shared/iso/iso-scene';
import { Icon } from '../../shared/ui/icon/icon';
import { IconName } from '../../shared/ui/icon/icons';

interface Step {
  icon: IconName;
  title: string;
  text: string;
}

interface Source {
  name: string;
  agency: string;
  what: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    icon: 'brush',
    title: 'Marcá tu lote',
    text: 'Pintá tus hectáreas sobre la imagen satelital o trazá el perímetro. No hace falta cargar planillas.',
  },
  {
    icon: 'satellite',
    title: 'El satélite lo observa',
    text: 'Consultamos en vivo los datos abiertos de la NASA para tu polígono: radar, verdor del cultivo, lluvia y humedad del suelo.',
  },
  {
    icon: 'footprint',
    title: 'Huella y trazabilidad',
    text: 'Una bitácora con evidencia, la huella de carbono estimada con el origen de cada dato y un pasaporte para compartir con tu acopio.',
  },
];

const SOURCES: Source[] = [
  {
    name: 'NISAR',
    agency: 'NASA e ISRO · radar banda L',
    what: 'Cambios en la superficie: siembra, labranza, anegamiento.',
    detail: 'Ve a través de las nubes. Pasa cada 12 días.',
  },
  {
    name: 'HLS',
    agency: 'NASA · Landsat y Sentinel-2 armonizados',
    what: 'Imagen óptica de 30 m para ver el lote y su cobertura.',
    detail: 'Varias pasadas por semana cuando no hay nubes.',
  },
  {
    name: 'MODIS',
    agency: 'NASA · Terra y Aqua',
    what: 'NDVI, el verdor del cultivo, cada 16 días desde el año 2000.',
    detail: 'Píxel de 250 m: más de 6 ha por píxel.',
  },
  {
    name: 'NASA POWER',
    agency: 'NASA · modelo y reanálisis',
    what: 'Lluvia, temperatura y humedad del suelo, día por día.',
    detail: 'Grilla de unos 50 km: es un valor regional.',
  },
];

/** página de inicio pública. "Probar demo" abre la cuenta demo gratuita y lleva al campo */
@Component({
  selector: 'app-landing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IsoScene, OriginBadge, EventGlyph, Icon],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css',
})
export class LandingPage {
  private readonly router = inject(Router);
  private readonly account = inject(DemoAccount);

  protected readonly steps = STEPS;
  protected readonly sources = SOURCES;
  protected readonly hasAccount = this.account.active;

  // los lotes de ejemplo de la zona, con su último dato satelital real
  private readonly overviews = overviewsSignal(
    inject(Api)
      .lots()
      .pipe(map((lots) => lots.filter(isExampleLot))),
  );
  protected readonly scene = computed(() => buildIsoScene(this.overviews() ?? []).lots);
  protected readonly highlights = computed(() =>
    (this.overviews() ?? [])
      .filter((item) => item.last !== null)
      .slice(0, 2)
      .map((item) => ({
        lot: item.lot.name,
        event: item.last!,
        date: formatDate(item.last!.date),
      })),
  );
  protected readonly loadingScene = computed(() => this.overviews() === undefined);

  protected startDemo(): void {
    this.account.start();
    void this.router.navigateByUrl('/mapa');
  }
}
