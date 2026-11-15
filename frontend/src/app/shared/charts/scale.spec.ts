import {
  addDays,
  dayToIso,
  isoToDay,
  linearScale,
  niceStep,
  niceTicks,
  stepDecimals,
  timeScale,
  timeTicks,
} from './scale';

describe('linearScale', () => {
  it('lleva el dominio al rango y vuelve con invert', () => {
    const scale = linearScale([0, 10], [100, 300]);
    expect(scale(0)).toBe(100);
    expect(scale(5)).toBe(200);
    expect(scale(10)).toBe(300);
    expect(scale.invert(250)).toBe(7.5);
    expect(scale.domain).toEqual([0, 10]);
    expect(scale.range).toEqual([100, 300]);
  });

  it('admite dominios con negativos y rangos invertidos', () => {
    const scale = linearScale([-2, 2], [200, 0]);
    expect(scale(-2)).toBe(200);
    expect(scale(0)).toBe(100);
    expect(scale(2)).toBe(0);
    expect(scale.invert(50)).toBe(1);
  });

  it('extrapola fuera del dominio salvo que se pida recortar', () => {
    expect(linearScale([0, 10], [0, 100])(15)).toBe(150);
    const clamped = linearScale([0, 10], [0, 100], true);
    expect(clamped(15)).toBe(100);
    expect(clamped(-3)).toBe(0);
  });

  it('con un dominio degenerado ubica todo en el centro del rango, sin dividir por cero', () => {
    const scale = linearScale([4, 4], [0, 100]);
    expect(scale(4)).toBe(50);
    expect(scale(1000)).toBe(50);
    expect(scale.invert(80)).toBe(4);
    expect(Number.isNaN(linearScale([NaN, 3], [0, 10])(2))).toBe(false);
  });
});

describe('niceStep', () => {
  it('devuelve siempre 1, 2 o 5 por una potencia de 10', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(100, 4)).toBe(50);
    expect(niceStep(3.5, 5)).toBe(1);
    expect(niceStep(0.9, 5)).toBe(0.2);
    expect(niceStep(7, 7)).toBe(1);
    expect(niceStep(1200, 5)).toBe(500);
    expect(niceStep(0.04, 4)).toBe(0.01);
    expect(niceStep(0.6, 6)).toBe(0.1);
  });

  it('no se rompe con un tramo nulo o inválido', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
    expect(niceStep(-10, 5)).toBe(2);
  });
});

describe('stepDecimals', () => {
  it('indica los decimales que necesita el rótulo de cada paso', () => {
    expect(stepDecimals(20)).toBe(0);
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(0.1)).toBe(1);
    expect(stepDecimals(0.02)).toBe(2);
    expect(stepDecimals(0)).toBe(0);
  });
});

describe('niceTicks', () => {
  it('cubre el tramo con marcas redondas y amplía el dominio hacia afuera', () => {
    const ticks = niceTicks(0, 87, 5);
    expect(ticks.step).toBe(20);
    expect(ticks.values).toEqual([0, 20, 40, 60, 80, 100]);
    expect(ticks.domain).toEqual([0, 100]);
    expect(ticks.decimals).toBe(0);
  });

  it('incluye negativos y pasa por cero', () => {
    const coarse = niceTicks(-1.78, 1.03, 5);
    expect(coarse.step).toBe(1);
    expect(coarse.values).toEqual([-2, -1, 0, 1, 2]);
    expect(coarse.decimals).toBe(0);

    const fine = niceTicks(-1.78, 1.03, 8);
    expect(fine.step).toBe(0.5);
    expect(fine.values).toEqual([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5]);
    expect(fine.decimals).toBe(1);
  });

  it('respeta el máximo de intervalos aunque el dominio se amplíe', () => {
    for (const max of [1, 2, 3, 4, 6, 8]) {
      expect(niceTicks(0.17, 0.51, max).values.length).toBeLessThanOrEqual(max + 1);
      expect(niceTicks(-37, 1234, max).values.length).toBeLessThanOrEqual(max + 1);
    }
  });

  it('no arrastra errores de coma flotante', () => {
    const ticks = niceTicks(0.1, 0.7, 6);
    expect(ticks.values).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    expect(niceTicks(0.23, 0.34, 4).values).toEqual([0.2, 0.25, 0.3, 0.35]);
  });

  it('con un solo valor abre un tramo alrededor para no degenerar la escala', () => {
    const single = niceTicks(0.34, 0.34, 4);
    expect(single.domain[0]).toBeLessThan(0.34);
    expect(single.domain[1]).toBeGreaterThan(0.34);
    expect(single.values.length).toBeGreaterThan(1);
    expect(niceTicks(0, 0).domain).toEqual([0, 1]);
    const negative = niceTicks(-8, -8, 4);
    expect(negative.domain[0]).toBeLessThan(-8);
    expect(negative.domain[1]).toBeGreaterThan(-8);
  });

  it('ordena un tramo invertido y tolera valores no finitos', () => {
    expect(niceTicks(10, 0, 5).values).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(NaN, Infinity).domain).toEqual([0, 1]);
  });

  it('nunca devuelve -0', () => {
    const zero = niceTicks(-1, 1, 4).values.find((value) => value === 0);
    expect(Object.is(zero, 0)).toBe(true);
  });
});

describe('isoToDay y dayToIso', () => {
  it('convierten sin correr el día por zona horaria', () => {
    expect(isoToDay('1970-01-01')).toBe(0);
    expect(isoToDay('1970-01-02')).toBe(1);
    expect(dayToIso(isoToDay('2026-09-07'))).toBe('2026-09-07');
    expect(isoToDay('2026-03-01') - isoToDay('2026-02-28')).toBe(1);
    expect(isoToDay('2024-03-01') - isoToDay('2024-02-28')).toBe(2);
  });

  it('acepta la parte de fecha de un texto con hora', () => {
    expect(isoToDay('2026-11-14T23:59:59-03:00')).toBe(isoToDay('2026-11-14'));
  });

  it('devuelve NaN para fechas que no existen o mal escritas', () => {
    expect(Number.isNaN(isoToDay('2026-02-30'))).toBe(true);
    expect(Number.isNaN(isoToDay('2026-13-01'))).toBe(true);
    expect(Number.isNaN(isoToDay('07/09/2026'))).toBe(true);
    expect(Number.isNaN(isoToDay(''))).toBe(true);
  });

  it('suma y resta días cruzando meses y años', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2023-03-02', -30)).toBe('2023-01-31');
  });
});

describe('timeScale', () => {
  it('ubica fechas en proporción a los días transcurridos', () => {
    const scale = timeScale(['2026-01-01', '2026-01-11'], [0, 100]);
    expect(scale('2026-01-01')).toBe(0);
    expect(scale('2026-01-06')).toBe(50);
    expect(scale('2026-01-11')).toBe(100);
    expect(scale.day(isoToDay('2026-01-03'))).toBe(20);
  });

  it('con un solo día cae en el centro del rango', () => {
    const scale = timeScale(['2026-10-28', '2026-10-28'], [40, 240]);
    expect(scale('2026-10-28')).toBe(140);
  });
});

describe('timeTicks', () => {
  it('marca cada mes cuando entran', () => {
    const { unit, ticks } = timeTicks('2026-08-28', '2026-10-31', 8);
    expect(unit).toBe('month');
    expect(ticks.map((tick) => tick.date)).toEqual(['2026-09-01', '2026-10-01']);
    expect(ticks.map((tick) => tick.label)).toEqual(['Sep 26', 'Oct 26']);
    expect(ticks.every((tick) => !tick.major)).toBe(true);
  });

  it('pasa a trimestres alineados al calendario cuando los meses no entran', () => {
    const { unit, ticks } = timeTicks('2023-01-31', '2024-02-10', 6);
    expect(unit).toBe('quarter');
    expect(ticks.map((tick) => tick.date)).toEqual([
      '2023-04-01',
      '2023-07-01',
      '2023-10-01',
      '2024-01-01',
    ]);
    expect(ticks.map((tick) => tick.label)).toEqual(['Apr 23', 'Jul 23', 'Oct 23', 'Jan 24']);
    expect(ticks.map((tick) => tick.major)).toEqual([false, false, false, true]);
  });

  it('pasa a años, y después a saltos de 2, 5 o 10 años', () => {
    const years = timeTicks('2023-01-31', '2026-11-14', 4);
    expect(years.unit).toBe('year');
    expect(years.step).toBe(1);
    expect(years.ticks.map((tick) => tick.label)).toEqual(['2024', '2025', '2026']);
    expect(years.ticks.every((tick) => tick.major)).toBe(true);

    const decades = timeTicks('1990-06-01', '2026-06-01', 4);
    expect(decades.unit).toBe('year');
    expect(decades.step).toBe(10);
    expect(decades.ticks.map((tick) => tick.label)).toEqual(['2000', '2010', '2020']);
  });

  it('incluye el primero de mes cuando el tramo empieza o termina justo ahí', () => {
    const { ticks } = timeTicks('2026-03-01', '2026-05-01', 8);
    expect(ticks.map((tick) => tick.date)).toEqual(['2026-03-01', '2026-04-01', '2026-05-01']);
  });

  it('cruza el cambio de año', () => {
    const { ticks } = timeTicks('2025-12-31', '2026-01-01', 8);
    expect(ticks.map((tick) => tick.date)).toEqual(['2026-01-01']);
    expect(ticks[0].label).toBe('Jan 26');
    expect(ticks[0].major).toBe(true);
  });

  it('queda sin marcas si el tramo no contiene ningún primero de mes', () => {
    expect(timeTicks('2026-11-02', '2026-11-14', 8).ticks).toEqual([]);
  });

  it('queda sin marcas con fechas inválidas o invertidas', () => {
    expect(timeTicks('2026-11-14', '2026-11-02').ticks).toEqual([]);
    expect(timeTicks('sin fecha', '2026-11-02').ticks).toEqual([]);
  });

  it('nunca supera el máximo pedido', () => {
    for (const max of [1, 2, 3, 5, 9]) {
      expect(timeTicks('2020-01-15', '2026-11-14', max).ticks.length).toBeLessThanOrEqual(max);
    }
  });
});
