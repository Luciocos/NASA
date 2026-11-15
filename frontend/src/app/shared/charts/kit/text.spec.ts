import { estimateTextWidth, maxLineWidth, wrapText } from './text';

describe('estimateTextWidth', () => {
  it('crece con el largo, el tamaño y el peso del texto', () => {
    const short = estimateTextWidth('Siembra');
    expect(short).toBeGreaterThan(0);
    expect(estimateTextWidth('Siembra directa')).toBeGreaterThan(short);
    expect(estimateTextWidth('Siembra', 14)).toBeGreaterThan(short);
    expect(estimateTextWidth('Siembra', 12, true)).toBeGreaterThan(short);
    expect(estimateTextWidth('')).toBe(0);
  });

  it('distingue letras angostas de anchas', () => {
    expect(estimateTextWidth('illi')).toBeLessThan(estimateTextWidth('mwmw'));
  });
});

describe('wrapText', () => {
  it('deja en una línea lo que entra', () => {
    expect(wrapText('Siembra', 200)).toEqual(['Siembra']);
  });

  it('corta por palabras sin pasar del ancho', () => {
    const lines = wrapText('Cambio de uso del suelo', 90);
    expect(lines.length).toBe(2);
    expect(lines.join(' ')).toBe('Cambio de uso del suelo');
    expect(maxLineWidth(lines)).toBeLessThanOrEqual(90);
  });

  it('abrevia con puntos suspensivos lo que no entra en las líneas pedidas', () => {
    const lines = wrapText('Producción de fertilizantes nitrogenados y fosfatados', 80, 12, 2);
    expect(lines.length).toBe(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(maxLineWidth(lines)).toBeLessThanOrEqual(80);
  });

  it('abrevia una palabra sola más ancha que el lugar', () => {
    const [line] = wrapText('Retrodispersión', 40, 12, 1);
    expect(line.endsWith('…')).toBe(true);
    expect(estimateTextWidth(line)).toBeLessThanOrEqual(40);
  });

  it('devuelve una línea vacía para un texto vacío', () => {
    expect(wrapText('   ', 100)).toEqual(['']);
  });
});
