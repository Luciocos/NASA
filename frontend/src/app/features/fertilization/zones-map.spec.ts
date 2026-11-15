import { NdviPixel } from '../../core/nasa';
import { pixelTooltip } from './zones-map';

const pixel = (extra: Partial<NdviPixel>): NdviPixel => ({
  ring: [],
  center: [0, 0],
  value: 0.62,
  reliability: 0,
  inside: true,
  ...extra,
});

describe('pixelTooltip', () => {
  it('en un píxel mixto dice qué parte del cuadro es del lote', () => {
    const text = pixelTooltip('NDVI alto', pixel({ insideHa: 1.24, insideShare: 0.23 }), true);
    expect(text).toContain('NDVI alto: NDVI 0,62');
    expect(text).toContain('1,2 ha en el lote');
    expect(text).toContain('Píxel mixto: solo el 23 % del cuadro está en tu lote');
  });

  it('en uno mayormente adentro da la parte sin llamarlo mixto', () => {
    const text = pixelTooltip('NDVI medio', pixel({ insideHa: 4, insideShare: 0.74 }), false);
    expect(text).toContain('el 74 % del cuadro está en tu lote');
    expect(text).not.toContain('mixto');
  });

  it('un cuadro casi entero no muestra un 100 % redondeado', () => {
    const text = pixelTooltip('NDVI alto', pixel({ insideHa: 5.3, insideShare: 0.997 }), false);
    expect(text).not.toContain('% del cuadro');
  });

  it('en un píxel entero no habla de mezcla', () => {
    const text = pixelTooltip('NDVI bajo', pixel({ insideHa: 5.4, insideShare: 1 }), false);
    expect(text).not.toContain('mixto');
  });
});
