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
    const text = pixelTooltip('High NDVI', pixel({ insideHa: 1.24, insideShare: 0.23 }), true);
    expect(text).toContain('High NDVI: NDVI 0,62');
    expect(text).toContain('1,2 ha in the field');
    expect(text).toContain('Mixed pixel: only 23 % of the cell is in your field');
  });

  it('en uno mayormente adentro da la parte sin llamarlo mixto', () => {
    const text = pixelTooltip('Medium NDVI', pixel({ insideHa: 4, insideShare: 0.74 }), false);
    expect(text).toContain('74 % of the cell is in your field');
    expect(text).not.toMatch(/mixed/i);
  });

  it('un cuadro casi entero no muestra un 100 % redondeado', () => {
    const text = pixelTooltip('High NDVI', pixel({ insideHa: 5.3, insideShare: 0.997 }), false);
    expect(text).not.toContain('% of the cell');
  });

  it('en un píxel entero no habla de mezcla', () => {
    const text = pixelTooltip('Low NDVI', pixel({ insideHa: 5.4, insideShare: 1 }), false);
    expect(text).not.toMatch(/mixed/i);
  });
});
