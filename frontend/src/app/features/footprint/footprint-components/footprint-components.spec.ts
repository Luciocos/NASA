import { ComponentFixture, TestBed } from '@angular/core/testing';

import { makeComponent, makeFootprint } from '../testing';
import { FootprintComponents } from './footprint-components';

describe('FootprintComponents', () => {
  let fixture: ComponentFixture<FootprintComponents>;
  const el = () => fixture.nativeElement as HTMLElement;
  const rows = () => [...el().querySelectorAll<HTMLElement>('.row')];
  const summary = (row: HTMLElement) => row.querySelector('summary')?.textContent ?? '';
  const body = (row: HTMLElement) => row.querySelector('.body')?.textContent ?? '';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FootprintComponents] }).compileComponents();
    fixture = TestBed.createComponent(FootprintComponents);
  });

  it('una fila de una línea por componente: estado, nombre, motivo corto o valor, y origen', async () => {
    fixture.componentRef.setInput(
      'footprint',
      makeFootprint({ components: [makeComponent(), ...makeFootprint().components] }),
    );
    await fixture.whenStable();
    const [yieldRow, seed, diesel] = rows();
    expect(rows().length).toBe(3);

    // sin dato: el motivo corto a la vista y el del backend al abrir la fila
    expect(summary(yieldRow)).toContain('No data');
    expect(summary(yieldRow)).toContain('Missing yield');
    expect(body(yieldRow)).toContain('Falta el rendimiento de la campaña 2025/26.');

    expect(summary(seed)).toContain('Calculated');
    expect(summary(seed)).toContain('Seed');
    expect(summary(seed)).toContain('7.5 kg CO2e/t');
    expect(summary(seed)).toContain('Estimated');

    expect(summary(diesel)).toContain('No data');
    expect(summary(diesel)).toContain('Diesel');
    expect(summary(diesel)).toContain('Missing data and factor');
    expect(summary(diesel)).not.toContain('factors.yaml');
    expect(body(diesel)).toContain('Falta el factor de emisión (sin valor con fuente');
    expect(diesel.classList).toContain('row--missing');
  });

  it('el dato, el factor con coma decimal y su fuente quedan plegados en la fila', async () => {
    fixture.componentRef.setInput('footprint', makeFootprint({ components: [makeComponent()] }));
    await fixture.whenStable();
    const details = rows()[1].querySelector('details')!;
    expect(details.open).toBe(false);
    const text = body(rows()[1]);
    expect(text).toContain('34 kg/ha');
    expect(text).toContain('1.772 kg CO2e/kg');
    expect(text).toContain('Factor source: Fuente de prueba, tabla 1');
    expect(text).toContain('Reference value, not observed by satellite.');
  });

  it('sin factor lo dice al abrir la fila', async () => {
    fixture.componentRef.setInput('footprint', makeFootprint());
    await fixture.whenStable();
    expect(body(rows()[1])).toContain('No factor with a source');
    expect(body(rows()[1])).toContain('Gasoil de labores');
  });

  it('con rinde lo muestra; "¿De dónde sale cada dato?" va en la ayuda (i)', async () => {
    fixture.componentRef.setInput(
      'footprint',
      makeFootprint({
        total_kg_co2e_per_t: 37.5,
        yield: { value: 3.2, unit: 't/ha', origin: 'DECLARED', status: 'calculado', reason: null },
        components: [makeComponent()],
      }),
    );
    await fixture.whenStable();
    expect(summary(rows()[0])).toContain('Has data');
    expect(summary(rows()[0])).toContain('3.2 t/ha');
    expect(summary(rows()[0])).toContain('Declared');
    // el total ya está en la tarjeta de resumen: el desglose no lo repite
    expect(el().textContent).not.toContain('37,5');
    const help = el().querySelector('app-info-tip');
    expect(help?.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Where does each piece of data come from?',
    );
    expect(help?.textContent).toContain('Verified:');
    expect(help?.textContent).toContain('Estimated:');
  });

  it('sin rinde, lo calculado se muestra por hectárea', async () => {
    fixture.componentRef.setInput(
      'footprint',
      makeFootprint({ components: [makeComponent({ kg_co2e_per_t: null })] }),
    );
    await fixture.whenStable();
    expect(summary(rows()[1])).toContain('60.2 kg CO2e/ha');
  });
});
