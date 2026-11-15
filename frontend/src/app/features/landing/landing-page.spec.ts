import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideSignedInTesting } from '../../core/auth/testing';
import { provideOfflineTesting } from '../../core/offline/testing';
import { LandingPage } from './landing-page';

describe('LandingPage', () => {
  let fixture: ComponentFixture<LandingPage>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';

  /** los enlaces del encabezado, por su texto */
  const heroLinks = (): Record<string, string | null> =>
    Object.fromEntries(
      [...el().querySelectorAll<HTMLAnchorElement>('.hero a')].map((a) => [
        a.textContent!.trim(),
        a.getAttribute('href'),
      ]),
    );

  async function setup(signedIn = false): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [LandingPage],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        signedIn ? provideSignedInTesting() : provideOfflineTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LandingPage);
    http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  }

  // la landing no le pide nada al backend: abre al instante y sin conexión
  afterEach(() => http.verify());

  it('mantiene el título y cuenta los tres pasos, el primero marcar el perímetro', async () => {
    await setup();

    expect(el().querySelector('h1')?.textContent?.trim()).toBe(
      'Facilitación y potenciador de productores en huella y trazabilidad',
    );
    const steps = [...el().querySelectorAll('.steps > li h3')].map((h) => h.textContent?.trim());
    expect(steps).toEqual([
      'Marcá el perímetro de tu lote sobre la imagen satelital',
      'Mirá lo que ve el satélite',
      'Conocé tu huella, fertilización y rentabilidad',
    ]);
    expect(text()).not.toMatch(/pint[áa]/i);
  });

  it('sin sesión: una acción principal para crear la cuenta, ingresar al lado y un ejemplo', async () => {
    await setup();

    expect(heroLinks()).toEqual({
      'Crear cuenta gratis': '/registrarse',
      'Ya tengo cuenta': '/ingresar',
      'Ver un lote de ejemplo': '/ejemplos',
    });
    const primary = el().querySelectorAll('.hero .btn--primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent?.trim()).toBe('Crear cuenta gratis');
    expect(el().querySelector('.bar a[href="/ingresar"]')?.textContent?.trim()).toBe('Ingresar');
  });

  it('con la sesión abierta lleva a su campo', async () => {
    await setup(true);

    expect(heroLinks()).toEqual({
      'Ir a mi campo': '/mapa',
      'Ver un lote de ejemplo': '/ejemplos',
    });
    expect(el().querySelector('.bar a[href="/mapa"]')?.textContent?.trim()).toBe('Ir a mi campo');
    expect(text()).not.toContain('Crear cuenta gratis');
    expect(el().querySelector('a[href="/ingresar"]')).toBeNull();
  });

  it('la imagen satelital dice qué es, de cuándo y de dónde sale, sin saltos al cargar', async () => {
    await setup();

    const img = el().querySelector<HTMLImageElement>('.sat img')!;
    expect(img.getAttribute('width')).toBe('1200');
    expect(img.getAttribute('height')).toBe('750');
    expect(img.alt).toContain('Casilda y Rosario');
    expect(img.getAttribute('srcset')).toContain('/zona-nucleo-landsat-1200.webp 1200w');
    const caption = el().querySelector('.sat figcaption')?.textContent ?? '';
    expect(caption).toContain('Landsat el 31/10/2026');
    expect(caption).toContain('NASA EOSDIS GIBS');
    const places = [...el().querySelectorAll('.sat__place')].map((p) => p.textContent?.trim());
    expect(places).toEqual(['Casilda', 'Rosario']);
  });

  it('la infografía de los datos de la NASA carga diferida y con su tamaño', async () => {
    await setup();

    const img = el().querySelector<HTMLImageElement>('.data img')!;
    expect(img.getAttribute('src')).toBe('/lotestigo-datos-nasa.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('width')).toBe('1600');
    expect(img.getAttribute('height')).toBe('1000');
    expect(img.alt).toContain('datos abiertos de la NASA');
  });

  it('es honesta: usa datos abiertos de la NASA, sin aval ni certificados', async () => {
    await setup();

    expect(text()).toContain('Usa datos abiertos de la NASA');
    expect(text()).toContain('No está afiliado a la NASA ni cuenta con su aval');
    expect(text()).not.toMatch(/certific/i);
  });
});
