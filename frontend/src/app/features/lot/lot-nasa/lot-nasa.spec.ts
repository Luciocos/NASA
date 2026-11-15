import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { LotDetail } from '../../../core/models';
import { provideNasaTesting } from '../../../core/nasa/testing';
import { SeriesChart } from '../../../shared/charts';
import { makeEvent } from '../testing';
import { LotNasa } from './lot-nasa';

// lote armado para la prueba: no representa un lote real
const LOT: LotDetail = {
  id: 1,
  name: 'Lote de prueba',
  renspa: '',
  locality: 'Casilda',
  province: 'Santa Fe',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-61.2, -33.05],
        [-61.19, -33.05],
        [-61.19, -33.04],
        [-61.2, -33.05],
      ],
    ],
  },
  area_ha: 24.94,
  event_count: 2,
  created_at: '2026-11-14T10:00:00Z',
  campaigns: [],
};

describe('LotNasa', () => {
  it('marca en la serie de NDVI solo los eventos del período que se pidió', async () => {
    await TestBed.configureTestingModule({
      imports: [LotNasa],
      providers: [...provideNasaTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(LotNasa);
    const lastMonth = new Date();
    lastMonth.setUTCDate(1);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    fixture.componentRef.setInput('lot', LOT);
    fixture.componentRef.setInput('events', [
      makeEvent({ id: 1, date: '2023-03-02', type_label: 'Cambio de uso del suelo' }),
      makeEvent({ id: 2, date: lastMonth.toISOString().slice(0, 10), type_label: 'Siembra' }),
    ]);
    await fixture.whenStable();

    // con los últimos 12 meses, un evento de 2023 estiraría el eje y achicaría la serie
    const chart = fixture.debugElement.query(By.directive(SeriesChart))
      .componentInstance as SeriesChart;
    expect(chart.markers().map((marker) => marker.label)).toEqual(['Siembra']);
  });
});
