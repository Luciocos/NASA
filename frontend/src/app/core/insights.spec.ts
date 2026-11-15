import {
  countByOrigin,
  formatHectares,
  lastEvent,
  latestCampaign,
  latestWithMetric,
  numberMetric,
  textMetric,
} from './insights';

const event = (id: number, date: string, metrics: Record<string, unknown> = {}) => ({
  id,
  date,
  metrics,
});

describe('insights', () => {
  it('elige la última campaña por etiqueta', () => {
    expect(latestCampaign([])).toBeNull();
    expect(
      latestCampaign([{ label: '2025/26' }, { label: '2026/27' }, { label: '2024/25' }])?.label,
    ).toBe('2026/27');
  });

  it('elige el último evento por fecha y desempata por id', () => {
    expect(lastEvent([])).toBeNull();
    const events = [event(3, '2026-09-07'), event(1, '2026-10-01'), event(2, '2026-10-01')];
    expect(lastEvent(events)?.id).toBe(2);
  });

  it('lee métricas numéricas y de texto sin inventar valores', () => {
    const e = event(1, '2026-09-07', {
      ndvi_last: 0.34,
      broken: Number.NaN,
      text: '0.5',
      optical_sensor: 'HLS',
      empty: '  ',
    });
    expect(numberMetric(e, 'ndvi_last')).toBe(0.34);
    expect(numberMetric(e, 'broken')).toBeNull();
    expect(numberMetric(e, 'text')).toBeNull();
    expect(numberMetric(e, 'missing')).toBeNull();
    expect(textMetric(e, 'optical_sensor')).toBe('HLS');
    expect(textMetric(e, 'empty')).toBeNull();
    expect(textMetric(e, 'ndvi_last')).toBeNull();
  });

  it('busca el evento más reciente que trae una métrica', () => {
    const events = [
      event(1, '2026-04-08', { ndvi_last: 0.2 }),
      event(2, '2026-10-28', { ndvi_last: 0.31 }),
      event(3, '2026-11-02', {}),
    ];
    expect(latestWithMetric(events, 'ndvi_last')).toEqual({ event: events[1], value: 0.31 });
    expect(latestWithMetric(events, 'hh_anomaly_change_db')).toBeNull();
  });

  it('cuenta por origen e ignora valores desconocidos', () => {
    const counts = countByOrigin(
      [{ origin: 'VERIFIED' }, { origin: 'VERIFIED' }, { origin: 'DECLARED' }, { origin: 'OTRO' }],
      ['VERIFIED', 'DECLARED', 'ESTIMATED'],
    );
    expect(counts).toEqual({ VERIFIED: 2, DECLARED: 1, ESTIMATED: 0 });
  });

  it('formatea hectáreas con un decimal', () => {
    expect(formatHectares(86.7211)).toBe('86.7 ha');
    expect(formatHectares(24)).toBe('24 ha');
  });
});
