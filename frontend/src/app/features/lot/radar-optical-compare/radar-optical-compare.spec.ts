import { ComponentFixture, TestBed } from '@angular/core/testing';

import { makeEvent } from '../testing';
import { RadarOpticalCompare } from './radar-optical-compare';

describe('RadarOpticalCompare', () => {
  let fixture: ComponentFixture<RadarOpticalCompare>;
  const el = () => fixture.nativeElement as HTMLElement;
  const missing = () => el().querySelector('.missing')?.textContent?.trim();
  const button = (label: string) =>
    [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RadarOpticalCompare] }).compileComponents();
    fixture = TestBed.createComponent(RadarOpticalCompare);
  });

  it('sin imágenes lo dice en una línea, con el motivo', async () => {
    fixture.componentRef.setInput('event', makeEvent());
    await fixture.whenStable();
    expect(missing()).toBe('No images: a person reported it');
    expect(el().querySelector('img')).toBeNull();

    fixture.componentRef.setInput('event', makeEvent({ sensor: 'NISAR' }));
    await fixture.whenStable();
    expect(missing()).toBe("No evidence images: processing hasn't delivered them yet");
  });

  it('superpone las dos imágenes con un deslizador y las pone lado a lado a pedido', async () => {
    fixture.componentRef.setInput(
      'event',
      makeEvent({
        sensor: 'NISAR',
        evidence_image_url: '/media/evidence/a_nisar.png',
        evidence_optical_image_url: '/media/evidence/a_hls.png',
      }),
    );
    await fixture.whenStable();
    const range = el().querySelector('input[type="range"]');
    expect(range).not.toBeNull();
    expect(range?.getAttribute('aria-label')).toBe('Visible percentage of NISAR (radar, L-band)');
    expect(range?.getAttribute('aria-valuetext')).toBe('50% of the radar image');
    // sobre la imagen, el rótulo corto
    const tags = [...el().querySelectorAll('.overlay__tag')].map((t) => t.textContent?.trim());
    expect(tags).toEqual(['NISAR radar', 'HLS optical']);
    expect(button('Overlaid')?.getAttribute('aria-pressed')).toBe('true');
    expect(missing()).toBeUndefined();

    button('Side by side')?.click();
    await fixture.whenStable();
    expect(button('Side by side')?.getAttribute('aria-pressed')).toBe('true');
    const captions = [...el().querySelectorAll('figcaption')].map((c) => c.textContent?.trim());
    expect(captions).toEqual(['NISAR (radar, L-band)', 'Optical (HLS)']);
    expect(el().querySelector('input[type="range"]')).toBeNull();
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
    const tags = [...el().querySelectorAll('.overlay__tag')].map((t) => t.textContent?.trim());
    expect(tags).toEqual(['Sentinel-1 (ESA, not NASA data)', 'Landsat optical']);
  });

  it('con una sola imagen la muestra y dice que falta la otra', async () => {
    fixture.componentRef.setInput(
      'event',
      makeEvent({ sensor: 'NISAR', evidence_image_url: '/media/evidence/a_nisar.png' }),
    );
    await fixture.whenStable();
    expect(el().querySelectorAll('img').length).toBe(1);
    expect(missing()).toBe('No optical image to compare');
    expect(el().querySelector('input[type="range"]')).toBeNull();
  });

  it('si una imagen no carga, muestra la que queda y lo dice', async () => {
    fixture.componentRef.setInput(
      'event',
      makeEvent({
        sensor: 'NISAR',
        evidence_image_url: '/media/evidence/a_nisar.png',
        evidence_optical_image_url: '/media/evidence/roto.png',
      }),
    );
    await fixture.whenStable();
    el().querySelector('.overlay__base')?.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(el().querySelectorAll('img').length).toBe(1);
    expect(missing()).toBe("The optical image didn't load");
  });
});
