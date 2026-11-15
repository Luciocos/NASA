import {
  NO_DATA,
  formatDate,
  formatDateWithUncertainty,
  formatMonthShort,
  formatNumber,
  formatPercent,
  formatSigned,
  formatUncertainty,
  formatValue,
  withUnit,
} from './format';

describe('formatNumber', () => {
  it('usa coma decimal, punto de miles y decimales fijos', () => {
    expect(formatNumber(1250.5)).toBe('1.250,5');
    expect(formatNumber(-1.78, 2)).toBe('-1,78');
    expect(formatNumber(0.3, 2)).toBe('0,30');
    expect(formatNumber(120, 0)).toBe('120');
    expect(formatNumber(1234567.891, 2)).toBe('1.234.567,89');
  });

  it('redondea sin dejar un cero negativo', () => {
    expect(formatNumber(-0.04, 1)).toBe('0,0');
    expect(formatNumber(-0.0004, 2)).toBe('0,00');
    expect(formatNumber(0.05, 1)).toBe('0,1');
  });

  it('muestra "Sin dato" si el valor no existe', () => {
    expect(formatNumber(null)).toBe(NO_DATA);
    expect(formatNumber(undefined)).toBe(NO_DATA);
    expect(formatNumber(NaN)).toBe(NO_DATA);
    expect(formatNumber(Infinity)).toBe(NO_DATA);
    expect(NO_DATA).toBe('Sin dato');
  });

  it('tolera una cantidad de decimales inválida', () => {
    expect(formatNumber(1.5, -3)).toBe('2');
    expect(formatNumber(1.5, NaN)).toBe('2');
    expect(formatNumber(1.26, 1.9)).toBe('1,3');
  });
});

describe('formatSigned', () => {
  it('muestra siempre el signo, salvo en cero', () => {
    expect(formatSigned(350)).toBe('+350');
    expect(formatSigned(-120.4)).toBe('-120');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(-0.2)).toBe('0');
    expect(formatSigned(1250.25, 1)).toBe('+1.250,3');
    expect(formatSigned(null)).toBe(NO_DATA);
  });
});

describe('formatValue y withUnit', () => {
  it('agrega la unidad solo si hay', () => {
    expect(formatValue(1.03, 'dB', 2)).toBe('1,03 dB');
    expect(formatValue(0.34, '', 2)).toBe('0,34');
    expect(formatValue(null, 'dB')).toBe(NO_DATA);
    expect(withUnit('+350', 'USD/ha')).toBe('+350 USD/ha');
    expect(withUnit('12')).toBe('12');
  });
});

describe('formatPercent', () => {
  it('pasa una proporción a porcentaje', () => {
    expect(formatPercent(0.625)).toBe('63 %');
    expect(formatPercent(0.625, 1)).toBe('62,5 %');
    expect(formatPercent(0)).toBe('0 %');
    expect(formatPercent(null)).toBe(NO_DATA);
  });
});

describe('formatDate', () => {
  it('pasa AAAA-MM-DD a DD/MM/AAAA sin correr el día', () => {
    expect(formatDate('2026-09-07')).toBe('07/09/2026');
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDate('2025-12-31')).toBe('31/12/2025');
    expect(formatDate('2024-02-29')).toBe('29/02/2024');
  });

  it('toma la fecha de un texto con hora, sin convertir la zona', () => {
    expect(formatDate('2026-11-14T23:59:59-03:00')).toBe('14/11/2026');
    expect(formatDate('2026-01-01T00:30:00Z')).toBe('01/01/2026');
  });

  it('devuelve "Sin dato" sin fecha y deja pasar lo que no es una fecha', () => {
    expect(formatDate(null)).toBe(NO_DATA);
    expect(formatDate('')).toBe(NO_DATA);
    expect(formatDate('a confirmar')).toBe('a confirmar');
  });
});

describe('formatMonthShort', () => {
  it('escribe el mes corto y el año de dos cifras', () => {
    expect(formatMonthShort('2026-09-07')).toBe('sep 26');
    expect(formatMonthShort('2026-01-01')).toBe('ene 26');
    expect(formatMonthShort('2025-12-31')).toBe('dic 25');
    expect(formatMonthShort('2009-05-10')).toBe('may 09');
  });

  it('no inventa un mes que no existe', () => {
    expect(formatMonthShort('2026-13-01')).toBe('2026-13-01');
    expect(formatMonthShort(undefined)).toBe(NO_DATA);
  });
});

describe('formatUncertainty', () => {
  it('distingue singular y plural', () => {
    expect(formatUncertainty(6)).toBe('± 6 días');
    expect(formatUncertainty(1)).toBe('± 1 día');
  });

  it('queda vacío si no hay incertidumbre informada', () => {
    expect(formatUncertainty(null)).toBe('');
    expect(formatUncertainty(0)).toBe('');
  });

  it('se suma a la fecha', () => {
    expect(formatDateWithUncertainty('2026-09-07', 6)).toBe('07/09/2026 ± 6 días');
    expect(formatDateWithUncertainty('2026-09-07', null)).toBe('07/09/2026');
  });
});
