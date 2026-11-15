import { NdviZone } from '../../core/nasa';
import { BLEND_COLORS, BlendSample, alphaFor, blendAt, rampColor } from './ndvi-blend';

const zone = (level: NdviZone['level'], from: number, to: number): NdviZone => ({
  level,
  label: level,
  from,
  to,
  pixels: [],
  share: 1 / 3,
  mixedShare: 0,
});
const ZONES = [zone('alto', 0.6, 0.9), zone('medio', 0.3, 0.6), zone('bajo', 0, 0.3)];

describe('degradado de ambientes', () => {
  it('en el centro de cada tercio usa el color del ambiente y entre medio mezcla', () => {
    expect(rampColor(0.15, ZONES)).toEqual(BLEND_COLORS.bajo);
    expect(rampColor(0.45, ZONES)).toEqual(BLEND_COLORS.medio);
    expect(rampColor(0.75, ZONES)).toEqual(BLEND_COLORS.alto);
    const mid = rampColor(0.6, ZONES);
    for (let i = 0; i < 3; i++) {
      const [a, b] = [BLEND_COLORS.medio[i], BLEND_COLORS.alto[i]].sort((x, y) => x - y);
      expect(mid[i]).toBeGreaterThanOrEqual(a);
      expect(mid[i]).toBeLessThanOrEqual(b);
    }
    // fuera del rango se queda en el color del extremo
    expect(rampColor(-1, ZONES)).toEqual(BLEND_COLORS.bajo);
    expect(rampColor(2, ZONES)).toEqual(BLEND_COLORS.alto);
  });

  it('sobre el centro de un cuadro pesa ese cuadro y a mitad de camino promedia', () => {
    const samples: BlendSample[] = [
      { center: [0, 0], value: 0.2, share: 1 },
      { center: [0, 0.01], value: 0.8, share: 0.2 },
    ];
    expect(blendAt(samples, [0, 0], 80)?.value).toBeCloseTo(0.2, 3);
    const half = blendAt(samples, [0, 0.005], 80);
    expect(half?.value).toBeCloseTo(0.5, 6);
    expect(half?.share).toBeCloseTo(0.6, 6);
    expect(blendAt([], [0, 0], 80)).toBeNull();
  });

  it('un cuadro que casi no toca el lote se ve más transparente', () => {
    expect(alphaFor(1)).toBeGreaterThan(alphaFor(0.3));
    expect(alphaFor(5)).toBe(alphaFor(1));
  });
});
