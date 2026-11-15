import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { LotDetail } from '../../../core/models';
import { TerritorialCheck } from '../territory.types';
import { PeriurbanMap } from './periurban-map';
import { PeriurbanDetails } from './periurban.types';

/** Detalle propio del chequeo 'periurban' dentro del panel de chequeos territoriales. */
@Component({
  selector: 'app-periurban-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeriurbanMap],
  template: `
    @if (details(); as d) {
      @if (d.locality) {
        <p class="line">
          Localidad más cercana: <strong>{{ d.locality }}</strong>
          @if (d.distance_to_urban_m !== undefined) {
            · distancia al área urbana:
            <strong>{{
              d.distance_to_urban_m === 0 ? 'lindante' : fmt(d.distance_to_urban_m, 0) + ' m'
            }}</strong>
          }
        </p>
      }

      @if (d.bands?.length) {
        <table class="bands">
          <caption class="sr-only">
            Superficie del lote dentro de cada franja de exclusión
          </caption>
          <thead>
            <tr>
              <th scope="col">Franja</th>
              <th scope="col">Radio</th>
              <th scope="col">Superficie del lote</th>
            </tr>
          </thead>
          <tbody>
            @for (band of d.bands; track band.key) {
              <tr>
                <th scope="row">
                  <span class="swatch" [attr.data-band]="band.key" aria-hidden="true"></span>
                  {{ band.label }}
                </th>
                <td>{{ fmt(band.buffer_m, 0) }} m</td>
                <td>
                  @if (band.overlap_ha > 0) {
                    <strong
                      >{{ fmt(band.overlap_ha, 1) }} ha ({{ fmt(band.overlap_pct, 1) }} %)</strong
                    >
                  } @else {
                    Ninguna
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <p class="note">
          Las franjas restringen la aplicación de fitosanitarios de clase toxicológica A y B.
        </p>
      }

      @if (d.geometry) {
        <app-periurban-map class="map" [lotGeometry]="lot().geometry" [zones]="d.geometry" />
        <ul class="legend" aria-label="Referencias del mapa">
          <li><span class="swatch" data-band="lot" aria-hidden="true"></span>Lote (borde azul)</li>
          <li>
            <span class="swatch" data-band="urban" aria-hidden="true"></span>Área urbana aproximada
          </li>
          @if (d.terrestrial_buffer_m) {
            <li>
              <span class="swatch" data-band="terrestrial" aria-hidden="true"></span>Franja
              terrestre ({{ fmt(d.terrestrial_buffer_m, 0) }} m, punteado corto)
            </li>
          }
          @if (d.aerial_buffer_m) {
            <li>
              <span class="swatch" data-band="aerial" aria-hidden="true"></span>Franja aérea ({{
                fmt(d.aerial_buffer_m, 0)
              }}
              m, guiones)
            </li>
          }
        </ul>
      }

      @if (d.norm; as n) {
        <details class="norm">
          <summary>Qué dice la norma</summary>
          <p>
            <a [href]="n.url" target="_blank" rel="noopener">{{ n.name }}</a>
          </p>
          <ul>
            <li>{{ n.article_terrestrial }}</li>
            <li>{{ n.article_aerial }}</li>
          </ul>
          @if (!n.municipal_ordinance) {
            <p>No se encontró una ordenanza municipal propia: se usa el marco provincial.</p>
          }
          @if (d.urban_boundary_note) {
            <p>{{ d.urban_boundary_note }}</p>
          }
        </details>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: 0.5rem;
      font-size: 0.9rem;
    }
    .line {
      margin: 0 0 0.5rem;
    }
    .bands {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0.25rem;
    }
    .bands th,
    .bands td {
      padding: 0.3rem 0.4rem;
      border-bottom: 1px solid var(--line, #ddd);
      text-align: left;
      font-weight: normal;
    }
    .bands thead th {
      font-size: 0.8rem;
      color: var(--ink-2, #555);
    }
    .note {
      margin: 0 0 0.5rem;
      font-size: 0.8rem;
      color: var(--ink-2, #555);
    }
    .map {
      margin: 0.5rem 0;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1rem;
      margin: 0 0 0.5rem;
      padding: 0;
      list-style: none;
      font-size: 0.8rem;
    }
    .swatch {
      display: inline-block;
      width: 0.9rem;
      height: 0.9rem;
      margin-right: 0.3rem;
      vertical-align: -0.1rem;
      border: 2px solid;
      border-radius: 2px;
    }
    .swatch[data-band='aerial'] {
      border-style: dashed;
      border-color: #b45309;
      background: rgb(245 158 11 / 0.25);
    }
    .swatch[data-band='terrestrial'] {
      border-style: dotted;
      border-color: #9a1c1c;
      background: rgb(220 38 38 / 0.3);
    }
    .swatch[data-band='urban'] {
      border-color: #374151;
      background: rgb(107 114 128 / 0.5);
    }
    .swatch[data-band='lot'] {
      border-color: #1d4ed8;
      background: transparent;
    }
    .norm summary {
      cursor: pointer;
    }
    .norm p,
    .norm ul {
      margin: 0.3rem 0;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `,
})
export class PeriurbanDetail {
  readonly check = input.required<TerritorialCheck>();
  readonly lot = input.required<LotDetail>();
  /** true si el usuario es dueño del lote y puede declarar. */
  readonly editable = input(false);

  protected readonly details = computed(
    () => this.check().details as unknown as Partial<PeriurbanDetails>,
  );

  protected fmt(value: number, digits: number): string {
    return value.toLocaleString('es-AR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
}
