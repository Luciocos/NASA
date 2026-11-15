import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideSignedInTesting } from '../../core/auth/testing';
import { provideOfflineTesting } from '../../core/offline/testing';
import { LandingPage } from './landing-page';

const TITLE =
  'Ecosistema que facilita y potencia a los productores y asesores en monitorear datos de la NASA simplificados, huellas, fertilización y rentabilidad';

/** un IntersectionObserver de mentira: la prueba decide cuánto del video se ve */
class FakeObserver {
  static last: FakeObserver | undefined;
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.last = this;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** se ve esa parte del video: 0 es fuera de la pantalla */
  show(ratio: number): void {
    const entry = {
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
    } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

interface FakeCue {
  startTime: number;
  endTime: number;
  text: string;
}

interface FakeTrack {
  kind: string;
  mode: string;
  cues: FakeCue[] | null;
}

/** la persona pidió menos movimiento: matchMedia responde que sí a esa consulta */
function lessMotion(): () => void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      matches: media.includes('reduce'),
      media,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  return () => Reflect.deleteProperty(window, 'matchMedia');
}

describe('LandingPage', () => {
  let fixture: ComponentFixture<LandingPage>;
  let http: HttpTestingController;
  let paused: boolean;
  let tracks: FakeTrack[];
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  let restore: (() => void) | undefined;
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const video = () => el().querySelector<HTMLVideoElement>('.hero video')!;
  const toggle = () => el().querySelector<HTMLButtonElement>('.demo__toggle');
  const chips = () => [...el().querySelectorAll<HTMLButtonElement>('.demo__chapter')];
  const current = () =>
    chips()
      .filter((chip) => chip.getAttribute('aria-current') === 'true')
      .map((chip) => chip.textContent?.trim());

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

  // jsdom no reproduce video: play, pause y las pistas son de mentira, y el observer lo maneja la prueba
  beforeEach(() => {
    paused = true;
    tracks = [
      { kind: 'captions', mode: 'showing', cues: null },
      { kind: 'chapters', mode: 'disabled', cues: null },
    ];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      paused = false;
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      paused = true;
      this.dispatchEvent(new Event('pause'));
    });
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
    vi.spyOn(HTMLMediaElement.prototype, 'textTracks', 'get').mockImplementation(
      () => tracks as unknown as TextTrackList,
    );
  });

  // la landing no le pide nada al backend: abre al instante y sin conexión
  afterEach(() => {
    http.verify();
    restore?.();
    restore = undefined;
    FakeObserver.last = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lleva el título nuevo exacto, con las palabras clave resaltadas, para productores y asesores', async () => {
    await setup();

    const h1 = el().querySelector('h1')!;
    expect(h1.textContent?.trim()).toBe(TITLE);
    expect([...h1.querySelectorAll('strong')].map((s) => s.textContent?.trim())).toEqual([
      'datos de la NASA simplificados',
      'huellas',
      'fertilización',
      'rentabilidad',
    ]);
    expect(el().querySelector('.hero__tag')?.textContent?.trim()).toBe(
      'Para productores agrícolas, ganaderos y asesores',
    );
    expect(text()).not.toMatch(/zona núcleo|granos/i);
  });

  it('cuenta los tres pasos, el primero marcar el perímetro', async () => {
    await setup();

    const steps = [...el().querySelectorAll('.steps > li h3')].map((h) => h.textContent?.trim());
    expect(steps).toEqual([
      'Marcá el perímetro del lote',
      'Mirá los datos de la NASA, simplificados',
      'Conocé huella, fertilización y rentabilidad',
    ]);
    expect(text()).not.toMatch(/pint[áa]/i);
  });

  it('poco texto a la vista: la bajada, cada paso y la sección de datos en una línea corta', async () => {
    await setup();

    const short = (selector: string) =>
      [...el().querySelectorAll(selector)].map((p) => p.textContent!.replace(/\s+/g, ' ').trim());
    const lines = [...short('.hero__lead'), ...short('.steps > li p'), ...short('.section__lead')];
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(90);
    expect(short('.hero__lead')[0]).toContain('datos abiertos de la NASA');
    // las estimaciones se dicen como tales, sin afirmar más de lo que son
    expect(short('.steps > li p')[2]).toContain('Son estimaciones');
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
    expect(el().querySelector('.final a.btn--primary')?.getAttribute('href')).toBe('/registrarse');
  });

  it('con la sesión abierta lleva a su campo', async () => {
    await setup(true);

    expect(heroLinks()).toEqual({
      'Ir a mi campo': '/mapa',
      'Ver un lote de ejemplo': '/ejemplos',
    });
    expect(el().querySelector('.bar a[href="/mapa"]')?.textContent?.trim()).toBe('Ir a mi campo');
    expect(el().querySelector('.final a.btn--primary')?.getAttribute('href')).toBe('/mapa');
    expect(text()).not.toContain('Crear cuenta gratis');
    expect(el().querySelector('a[href="/ingresar"]')).toBeNull();
  });

  it('la marca muestra las tres capas, nítidas en 2x y 3x, sin repetir el nombre ni saltar al cargar', async () => {
    await setup();

    const brand = el().querySelector<HTMLAnchorElement>('.bar .brand')!;
    expect(brand.textContent?.trim()).toBe('LoTestigo');
    expect(brand.querySelector('svg')).toBeNull();
    const logo = brand.querySelector<HTMLImageElement>('img.brand-logo')!;
    expect(logo.getAttribute('src')).toBe('/lotestigo-mark-32.png');
    expect(logo.getAttribute('srcset')).toBe(
      '/lotestigo-mark-32.png 1x, /lotestigo-mark-64.png 2x, /lotestigo-mark-96.png 3x',
    );
    expect(logo.getAttribute('alt')).toBe('');
    expect([logo.getAttribute('width'), logo.getAttribute('height')]).toEqual(['28', '32']);
  });

  it('el recorrido: webm y mp4, póster, sin sonido, en línea, en bucle, con subtítulos y capítulos', async () => {
    await setup();

    const sources = [...video().querySelectorAll('source')].map((source) => [
      source.getAttribute('src'),
      source.getAttribute('type'),
    ]);
    expect(sources).toEqual([
      ['/landing/demo.webm', 'video/webm'],
      ['/landing/demo.mp4', 'video/mp4'],
    ]);
    expect(video().getAttribute('poster')).toBe('/landing/demo-poster.webp');
    expect(video().getAttribute('preload')).toBe('metadata');
    expect([video().getAttribute('width'), video().getAttribute('height')]).toEqual([
      '1280',
      '800',
    ]);
    for (const name of ['muted', 'playsinline', 'loop'])
      expect(video().hasAttribute(name)).toBe(true);
    // el atributo solo no silencia un video creado desde el código
    expect(video().muted).toBe(true);
    // no arranca por su cuenta al cargar: lo arranca el observer cuando se ve
    expect(video().hasAttribute('autoplay')).toBe(false);
    expect(play).not.toHaveBeenCalled();

    const trackAttrs = [...video().querySelectorAll('track')].map((track) => ({
      kind: track.getAttribute('kind'),
      src: track.getAttribute('src'),
      srclang: track.getAttribute('srclang'),
      default: track.hasAttribute('default'),
    }));
    expect(trackAttrs).toEqual([
      { kind: 'captions', src: '/landing/demo.es.vtt', srclang: 'es', default: true },
      { kind: 'chapters', src: '/landing/demo.chapters.vtt', srclang: 'es', default: false },
    ]);
    // la descripción del video para quien no lo ve
    expect(el().querySelector('.demo figcaption')?.textContent).toContain('sin sonido');
  });

  it('arranca solo al entrar en pantalla, se pausa al salir y el botón de 44 px manda', async () => {
    await setup();
    const observer = FakeObserver.last!;
    expect(observer.observe).toHaveBeenCalledWith(video());

    observer.show(0.2);
    expect(play).not.toHaveBeenCalled();
    observer.show(0.6);
    await fixture.whenStable();
    expect(play).toHaveBeenCalledTimes(1);
    expect(toggle()?.getAttribute('aria-label')).toBe('Pausar el recorrido');
    expect(toggle()?.classList).toContain('btn--icon');

    observer.show(0);
    await fixture.whenStable();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(toggle()?.getAttribute('aria-label')).toBe('Reproducir el recorrido');
    observer.show(1);
    expect(play).toHaveBeenCalledTimes(2);

    // la persona lo pausa: aunque salga y vuelva a la pantalla, no arranca de nuevo
    toggle()!.click();
    await fixture.whenStable();
    expect(pause).toHaveBeenCalledTimes(2);
    expect(toggle()?.getAttribute('aria-label')).toBe('Reproducir el recorrido');
    observer.show(0);
    observer.show(1);
    expect(play).toHaveBeenCalledTimes(2);

    toggle()!.click();
    await fixture.whenStable();
    expect(play).toHaveBeenCalledTimes(3);
    expect(toggle()?.getAttribute('aria-label')).toBe('Pausar el recorrido');
  });

  it('con menos movimiento no arranca solo: queda el póster con un botón para verlo', async () => {
    restore = lessMotion();
    await setup();

    FakeObserver.last!.show(1);
    await fixture.whenStable();
    expect(play).not.toHaveBeenCalled();
    const start = el().querySelector<HTMLButtonElement>('.demo__start')!;
    expect(start.textContent?.trim()).toBe('Ver el recorrido');
    expect(start.getAttribute('type')).toBe('button');

    start.click();
    await fixture.whenStable();
    expect(play).toHaveBeenCalledTimes(1);
    expect(el().querySelector('.demo__start')).toBeNull();
    // el botón grande se va: el foco queda en el de pausa
    expect(document.activeElement).toBe(toggle());
    expect(toggle()?.getAttribute('aria-label')).toBe('Pausar el recorrido');
  });

  it('si el navegador no lo deja arrancar solo, también ofrece el botón para verlo', async () => {
    play.mockImplementation(() =>
      Promise.reject(new DOMException('sin permiso', 'NotAllowedError')),
    );
    await setup();

    FakeObserver.last!.show(1);
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
    expect(el().querySelector('.demo__start')?.textContent?.trim()).toBe('Ver el recorrido');
  });

  it('los capítulos salen de la pista del video: saltan a su parte y marcan el que se ve', async () => {
    await setup();

    // la pista de capítulos se carga sin mostrarse; hasta que llega no hay capítulos
    expect(tracks[1].mode).toBe('hidden');
    expect(chips()).toHaveLength(0);
    tracks[1].cues = [
      { startTime: 0, endTime: 8, text: 'Marcar el lote' },
      { startTime: 8, endTime: 15, text: 'Datos de la NASA' },
      { startTime: 15, endTime: 24, text: '<b>Historia del lote</b>' },
    ];
    video().querySelector('track[kind="chapters"]')!.dispatchEvent(new Event('load'));
    await fixture.whenStable();

    expect(chips().map((chip) => chip.textContent?.trim())).toEqual([
      'Marcar el lote',
      'Datos de la NASA',
      'Historia del lote',
    ]);
    expect(el().querySelector('.demo__chapters')?.getAttribute('aria-label')).toBe(
      'Partes del recorrido',
    );
    expect(current()).toEqual(['Marcar el lote']);

    video().currentTime = 11.5;
    video().dispatchEvent(new Event('timeupdate'));
    await fixture.whenStable();
    expect(current()).toEqual(['Datos de la NASA']);
    expect(chips()[1].style.getPropertyValue('--p')).toBe('0.5');

    chips()[2].click();
    await fixture.whenStable();
    expect(video().currentTime).toBe(15);
    expect(play).toHaveBeenCalledTimes(1);
    expect(current()).toEqual(['Historia del lote']);
  });

  it('si el video no carga queda la imagen satelital, sin controles rotos', async () => {
    await setup();
    const sources = video().querySelectorAll('source');

    // sin webm sigue con el mp4
    sources[0].dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(el().querySelector('.demo__fallback')).toBeNull();

    sources[1].dispatchEvent(new Event('error'));
    await fixture.whenStable();
    const img = el().querySelector<HTMLImageElement>('.demo__fallback')!;
    expect(img.getAttribute('src')).toBe('/zona-nucleo-landsat-800.webp');
    expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['1200', '750']);
    expect(img.alt).toContain('Casilda y Rosario');
    expect(el().querySelector('.demo__credit')?.textContent).toContain('Landsat el 31/10/2026');
    expect(toggle()).toBeNull();
    expect(el().querySelector('.demo__start')).toBeNull();
    FakeObserver.last!.show(1);
    expect(play).not.toHaveBeenCalled();
  });

  it('el cierre lleva la imagen satelital de fondo, con su fuente y carga diferida', async () => {
    await setup();

    const img = el().querySelector<HTMLImageElement>('.final img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['1200', '750']);
    expect(img.getAttribute('srcset')).toContain('/zona-nucleo-landsat-1200.webp 1200w');
    // de fondo es decorativa: lo que muestra lo dice el texto de la fuente
    expect(img.getAttribute('alt')).toBe('');
    const credit = el().querySelector('.final__credit')?.textContent ?? '';
    expect(credit).toContain('Casilda y Rosario vistos por Landsat el 31/10/2026');
    expect(credit).toContain('NASA EOSDIS GIBS');
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
