import { ComponentFixture, TestBed } from '@angular/core/testing';

import { makeEvent } from '../testing';
import { RadarOpticalCompare } from './radar-optical-compare';

describe('RadarOpticalCompare', () => {
  let fixture: ComponentFixture<RadarOpticalCompare>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RadarOpticalCompare] }).compileComponents();
    fixture = TestBed.createComponent(RadarOpticalCompare);
  });

  it('avisa cuando el evento no tiene imágenes', async () => {
    fixture.componentRef.setInput('event', makeEvent());
    await fixture.whenStable();
    expect(el().textContent).toContain('todavía no tiene imágenes de evidencia');
    expect(el().querySelector('img')).toBeNull();
    expect(el().textContent).toContain('Dato simulado para la demostración');
  });

  it('muestra las dos imágenes con su sensor real y el deslizador', async () => {
    fixture.componentRef.setInput(
      'event',
      makeEvent({
        sensor: 'NISAR',
        evidence_image_url: '/media/evidence/a_nisar.png',
        evidence_optical_image_url: '/media/evidence/a_hls.png',
      }),
    );
    await fixture.whenStable();
    const captions = [...el().querySelectorAll('figcaption')].map((c) => c.textContent?.trim());
    expect(captions).toEqual(['NISAR (radar, banda L)', 'Óptico (HLS)']);
    expect(el().querySelector('input[type="range"]')).not.toBeNull();
  });

  it('no rotula como NISAR una evidencia de otro sensor', async () => {
    fixture.componentRef.setInput(
      'event',
      makeEvent({
        sensor: 'SENTINEL1',
        evidence_image_url: '/media/evidence/a_s1.png',
        metrics: { optical_sensor: 'Landsat' },
        evidence_optical_image_url: '/media/evidence/a_landsat.png',
      }),
    );
    await fixture.whenStable();
    const text = el().textContent ?? '';
    expect(text).not.toContain('NISAR');
    expect(text).toContain('Sentinel-1');
    expect(text).toContain('Óptico (Landsat)');
  });

  it('con una sola imagen la muestra y explica que falta la otra', async () => {
    fixture.componentRef.setInput(
      'event',
      makeEvent({ sensor: 'NISAR', evidence_image_url: '/media/evidence/a_nisar.png' }),
    );
    await fixture.whenStable();
    expect(el().querySelectorAll('img').length).toBe(1);
    expect(el().textContent).toContain('no tiene imagen óptica');
    expect(el().querySelector('input[type="range"]')).toBeNull();
  });
});
