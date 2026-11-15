import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Hydrograph } from './water.types';

/** una curva de caudal para comparar (otro escenario u otro evento) */
export interface HydroSeries {
  label: string;
  hydrograph: Hydrograph;
  color: string;
  dash?: string;
}

const W = 640;
const H = 260;
const PAD = { left: 52, right: 14, top: 12, bottom: 34 };
/** parte de arriba reservada a las barras de lluvia */
const RAIN_H = 70;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

const fmt = (v: number, d = 2) => v.toLocaleString('en-US', { maximumFractionDigits: d });

/**
 * hietograma (barras de lluvia colgando desde arriba) e hidrograma (caudal en m³/s) en el mismo
 * eje de tiempo, en horas desde el inicio de la lluvia. Un SVG simple, sin librerías
 */
@Component({
  selector: 'app-hydro-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      role="img"
      [attr.aria-label]="ariaLabel()"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- ejes -->
      <line
        [attr.x1]="pad.left"
        [attr.x2]="width - pad.right"
        [attr.y1]="baseY"
        [attr.y2]="baseY"
        class="axis"
      />
      <line
        [attr.x1]="pad.left"
        [attr.x2]="pad.left"
        [attr.y1]="pad.top"
        [attr.y2]="baseY"
        class="axis"
      />
      @for (tick of yTicks(); track tick.v) {
        <line
          [attr.x1]="pad.left - 4"
          [attr.x2]="width - pad.right"
          [attr.y1]="tick.y"
          [attr.y2]="tick.y"
          class="grid"
        />
        <text [attr.x]="pad.left - 6" [attr.y]="tick.y + 4" text-anchor="end" class="tick">
          {{ tick.label }}
        </text>
      }
      @for (tick of xTicks(); track tick.v) {
        <text [attr.x]="tick.x" [attr.y]="baseY + 16" text-anchor="middle" class="tick">
          {{ tick.label }}
        </text>
      }
      <text
        [attr.x]="(width + pad.left) / 2"
        [attr.y]="height - 4"
        text-anchor="middle"
        class="axis-label"
      >
        hours since the rain started
      </text>
      <text
        [attr.x]="12"
        [attr.y]="(baseY + pad.top + rainH) / 2"
        class="axis-label"
        text-anchor="middle"
        [attr.transform]="'rotate(-90 12 ' + (baseY + pad.top + rainH) / 2 + ')'"
      >
        flow m³/s
      </text>
      <!-- lluvia -->
      @for (bar of rainBars(); track bar.x) {
        <rect
          [attr.x]="bar.x"
          [attr.y]="pad.top"
          [attr.width]="bar.w"
          [attr.height]="bar.h"
          class="rain"
        />
      }
      @if (rainMax() > 0) {
        <text [attr.x]="width - pad.right" [attr.y]="pad.top + 10" text-anchor="end" class="tick">
          lluvia, máx. {{ fmt(rainMax(), 1) }} mm por paso
        </text>
      }
      <!-- caudales -->
      @for (s of paths(); track s.label) {
        <path
          [attr.d]="s.d"
          [attr.stroke]="s.color"
          [attr.stroke-dasharray]="s.dash ?? null"
          class="flow"
        />
      }
    </svg>
    @if (series().length > 1) {
      <ul class="legend">
        @for (s of series(); track s.label) {
          <li><span class="swatch" [style.background]="s.color"></span>{{ s.label }}</li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .axis {
      stroke: var(--ink-400, #8a96a3);
      stroke-width: 1;
    }
    .grid {
      stroke: var(--line, rgba(127, 127, 127, 0.18));
      stroke-width: 1;
    }
    .tick {
      font-size: 11px;
      fill: var(--ink-500, #6b7785);
    }
    .axis-label {
      font-size: 11px;
      fill: var(--ink-500, #6b7785);
    }
    .rain {
      fill: #5aa9e6;
      opacity: 0.75;
    }
    .flow {
      fill: none;
      stroke-width: 2.25;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1rem;
      list-style: none;
      margin: 0.25rem 0 0;
      padding: 0;
      font-size: 0.85rem;
    }
    .swatch {
      display: inline-block;
      width: 0.9rem;
      height: 0.25rem;
      margin-right: 0.35rem;
      vertical-align: middle;
      border-radius: 2px;
    }
  `,
})
export class HydroChart {
  /** lluvia en mm por paso */
  readonly rain = input<number[]>([]);
  readonly rainStepH = input(0.5);
  readonly series = input<HydroSeries[]>([]);
  readonly ariaLabel = input('Rainfall and hydrograph');

  protected readonly width = W;
  protected readonly height = H;
  protected readonly pad = PAD;
  protected readonly rainH = RAIN_H;
  protected readonly baseY = H - PAD.bottom;
  protected readonly fmt = fmt;

  private readonly tMax = computed(() => {
    const flows = this.series().map((s) => {
      // se corta la cola cuando el caudal ya bajó a menos del 1 % del pico
      const { times_h, flow_m3s } = s.hydrograph;
      const peak = Math.max(0, ...flow_m3s);
      let last = times_h.length - 1;
      while (last > 0 && flow_m3s[last] < peak * 0.01) last--;
      return times_h[Math.min(times_h.length - 1, last + 2)] ?? 0;
    });
    const rainEnd = this.rain().length * this.rainStepH();
    return Math.max(1, rainEnd, ...flows);
  });
  private readonly qMax = computed(() =>
    niceMax(Math.max(0, ...this.series().flatMap((s) => s.hydrograph.flow_m3s))),
  );
  protected readonly rainMax = computed(() => Math.max(0, ...this.rain()));

  private x(t: number): number {
    return PAD.left + (t / this.tMax()) * (W - PAD.left - PAD.right);
  }

  private y(q: number): number {
    const top = PAD.top + RAIN_H;
    return this.baseY - (q / this.qMax()) * (this.baseY - top);
  }

  protected readonly rainBars = computed(() => {
    const max = this.rainMax();
    const step = this.rainStepH();
    if (max <= 0) return [];
    const w = Math.max(1, this.x(step) - this.x(0) - 1);
    return this.rain().map((mm, i) => ({
      x: this.x(i * step),
      w,
      h: (mm / max) * (RAIN_H - 8),
    }));
  });

  protected readonly paths = computed(() =>
    this.series().map((s) => ({
      ...s,
      d: s.hydrograph.times_h
        .map((t, i) =>
          t <= this.tMax()
            ? `${i ? 'L' : 'M'}${this.x(t).toFixed(1)},${this.y(s.hydrograph.flow_m3s[i]).toFixed(1)}`
            : '',
        )
        .join(''),
    })),
  );

  protected readonly yTicks = computed(() => {
    const max = this.qMax();
    return [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      v: f * max,
      y: this.y(f * max),
      label: fmt(f * max, max < 1 ? 3 : 2),
    }));
  });

  protected readonly xTicks = computed(() => {
    const max = this.tMax();
    const step = niceMax(max / 6);
    const ticks = [];
    for (let t = 0; t <= max + 1e-9; t += step)
      ticks.push({ v: t, x: this.x(t), label: fmt(t, 1) });
    return ticks;
  });
}
