import { Provider, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { LotDetail } from '../../../core/models';
import { ClimateDay, LotSatellite, NASA_CLIENTS, NasaClients } from '../../../core/nasa';
import { provideNasaTesting } from '../../../core/nasa/testing';
import { Connectivity } from '../../../core/offline';
import { ColumnChart, SeriesChart } from '../../../shared/charts';
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

  it('sin red avisa que lo pendiente se consulta al volver, y al volver reintenta', async () => {
    const online = signal(false);
    const fixture = await setup([
      { provide: NASA_CLIENTS, useValue: silentClients() },
      { provide: Connectivity, useValue: { online } },
    ]);
    const retry = vi.spyOn(TestBed.inject(LotSatellite), 'retry');
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text()).toContain('Sin conexión: se consulta cuando vuelva la red');
    expect(text()).not.toContain('Consultando MODIS');
    expect(text()).not.toContain('Cargando el historial');

    online.set(true);
    await settle(fixture);
    expect(retry).toHaveBeenCalledWith({ id: LOT.id, geometry: LOT.geometry });
    expect(text()).toContain('Consultando MODIS');
  });

  it('si falla la consulta al catálogo lo avisa y ofrece reintentar, sin mostrar cero escenas', async () => {
    const fixture = await setup(provideNasaTesting());
    const element = fixture.nativeElement as HTMLElement;
    const text = element.textContent ?? '';

    expect(text).toContain('La consulta al catálogo falló. Sin conexión y sin una copia guardada');
    expect(text).not.toContain('Sin pasadas en el catálogo');
    expect(text).not.toContain('Sin imágenes en el catálogo');
    expect(text).not.toContain('imágenes HLS en el catálogo');
    const retries = [...element.querySelectorAll('button')].filter(
      (button) => button.textContent?.trim() === 'Reintentar',
    );
    expect(retries.length).toBe(3);
  });

  it('marca el mes en curso de la lluvia como parcial', async () => {
    // lluvia armada para la prueba: no es un dato de NASA POWER
    const days: ClimateDay[] = [];
    for (let t = Date.UTC(2026, 9, 1); t <= Date.UTC(2026, 10, 14); t += 86_400_000) {
      const date = new Date(t).toISOString().slice(0, 10);
      days.push({
        date,
        rainMm: date <= '2026-11-10' ? 2 : null,
        tMaxC: null,
        tMinC: null,
        soilTop: null,
        soilRoot: null,
      });
    }
    const daily = async (_point: unknown, _from: string, to: string) => ({
      data: to === '2026-11-14' ? days : [],
      stale: false,
      savedAt: '2026-11-14T12:00:00.000Z',
    });
    const fixture = await setup([
      {
        provide: NASA_CLIENTS,
        useValue: silentClients({ power: { daily }, now: () => Date.UTC(2026, 10, 14, 12) }),
      },
    ]);

    const chart = fixture.debugElement.query(By.directive(ColumnChart))
      .componentInstance as ColumnChart;
    expect(chart.items().map((item) => item.label)).toEqual(['oct 26', 'nov 26*']);
    expect(chart.items()[1].note).toBe('mes en curso: hasta el 10/11');
    expect(chart.items()[0].note).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      '* nov 26 es el mes en curso: suma la lluvia hasta el 10/11, no la del mes completo.',
    );
  });
});

async function setup(providers: Provider[]): Promise<ComponentFixture<LotNasa>> {
  await TestBed.configureTestingModule({ imports: [LotNasa], providers }).compileComponents();
  const fixture = TestBed.createComponent(LotNasa);
  fixture.componentRef.setInput('lot', LOT);
  await settle(fixture);
  return fixture;
}

/** deja correr los pedidos dobles (todo en microtareas) y vuelve a dibujar */
async function settle(fixture: ComponentFixture<LotNasa>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

/** clientes que nunca responden: cada dato queda cargando */
function silentClients(overrides: Partial<NasaClients> = {}): NasaClients {
  const never = () => new Promise<never>(() => undefined);
  return {
    power: { daily: never },
    modis: { ndviBatch: never, landCover: never },
    scenes: { nisarScenes: never, hlsScenes: never },
    gibs: null as unknown as NasaClients['gibs'],
    now: () => Date.now(),
    ...overrides,
  };
}
