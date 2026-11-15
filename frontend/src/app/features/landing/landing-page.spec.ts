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

  describe('la documentación', () => {
    const docs = () => el().querySelector<HTMLElement>('app-landing-docs')!;
    /** cada grupo de la documentación, por el id de su título */
    const group = (id: string) => docs().querySelector(`#${id}`)!.closest('section')!;
    const tabs = () => [...docs().querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panels = () => [...docs().querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    const clean = (node: Element | null | undefined) =>
      node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    /** los tres pasos del recorrido de una fuente, cada uno como texto corrido */
    const flow = (id: string) =>
      [...docs().querySelectorAll(`#docs-panel-${id} .flow > li`)].map((step) => clean(step));

    it('arranca con los dos caminos: en vivo desde el navegador y procesado aparte en Python', async () => {
      await setup();

      expect(el().querySelector('#docs-title')?.textContent).toContain('Documentación');
      expect(el().querySelector('img[src*="lotestigo-datos-nasa"]')).toBeNull();
      const paths = [...docs().querySelectorAll('.path')];
      expect(paths.map((path) => clean(path.querySelector('.chip')))).toEqual([
        'En vivo',
        'Procesado aparte',
      ]);
      expect(paths.map((path) => [...path.querySelectorAll('.path__nodes li')].map(clean))).toEqual(
        [
          ['NASA, sin login', 'Navegador', 'Copia en el dispositivo', 'Pantalla'],
          ['Earthdata, con login', 'Pipeline en Python', 'Django y PostgreSQL', 'App'],
        ],
      );
      // las flechas entre uno y otro son dibujo: el lector de pantalla no las lee
      for (const path of paths) {
        expect(path.querySelectorAll('.path__nodes app-icon[aria-hidden="true"]')).toHaveLength(3);
      }
      expect(clean(paths[0].querySelector('.path__note'))).toBe(
        'MODIS, NASA POWER y CMR, por HTTPS y JSON. No pasan por el backend.',
      );
      expect(clean(paths[1].querySelector('.path__note'))).toContain(
        'NISAR, HLS, IMERG, SMAP y MOD16',
      );
    });

    it('cada fuente de la NASA cuenta en tres pasos de dónde sale, cómo llega y qué muestra la app', async () => {
      await setup();

      expect(docs().querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
        'Fuentes de la NASA',
      );
      expect(tabs().map(clean)).toEqual([
        'NISAR',
        'HLS',
        'MODIS',
        'NASA POWER',
        'CMR',
        'IMERG · SMAP · MOD16',
      ]);
      expect(panels()).toHaveLength(6);
      tabs().forEach((tab, i) => {
        const panel = panels()[i];
        expect(tab.getAttribute('aria-controls')).toBe(panel.id);
        expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
        const steps = [...panel.querySelectorAll('.flow > li')];
        expect(steps.map((step) => clean(step.querySelector('.step__name')))).toEqual([
          'De dónde sale',
          'Cómo llega',
          'En la app',
        ]);
        // poco texto a la vista: una línea corta por paso y lo técnico en fichas
        for (const step of steps) {
          expect(clean(step.querySelector('.step__text')).length).toBeLessThanOrEqual(50);
          const tags = [...step.querySelectorAll('.tags li')].map(clean);
          expect(tags.length).toBeGreaterThan(0);
          for (const tag of tags) expect(tag.length).toBeLessThanOrEqual(24);
        }
        // el último paso dice con qué origen lo muestra la app, o por qué no lleva uno
        expect(steps[2].querySelector('app-origin-badge, .chip')).toBeTruthy();
      });

      // cada una dice su camino: en vivo desde el navegador o procesada aparte
      const live = (id: string) =>
        clean(docs().querySelector(`#docs-panel-${id} .panel__head .chip`));
      expect(['nisar', 'hls', 'modis', 'power', 'cmr', 'hydrology'].map(live)).toEqual([
        'Procesado aparte',
        'Procesado aparte',
        'En vivo',
        'En vivo',
        'En vivo',
        'Procesado aparte',
      ]);

      // NASA POWER: el navegador pide la API por HTTPS, guarda una copia y Satélite lo muestra estimado
      const power = flow('power');
      expect(power[1]).toContain('El navegador pide el clima del centro del lote');
      for (const tag of ['API REST', 'HTTPS · JSON', 'Copia en el dispositivo']) {
        expect(power[1]).toContain(tag);
      }
      expect(power[2]).toContain('Lluvia de 30 días y humedad del suelo');
      expect(power[2]).toContain('Satélite');
      expect(power[2]).toContain('Estimado');

      // NISAR: de Earthdata al pipeline, de ahí a la base con import_events y a la bitácora
      const nisar = flow('nisar');
      expect(nisar[0]).toContain('ASF DAAC');
      expect(nisar[1]).toContain('Earthdata Login');
      expect(nisar[1]).toContain('import_events');
      expect(nisar[2]).toContain('Bitácora');
      expect(nisar[2]).toContain('Verificado');

      // MODIS va en vivo por el ORNL DAAC a cuatro pantallas
      const modis = flow('modis');
      expect(modis[0]).toContain('ORNL DAAC');
      for (const place of ['Satélite', 'Mi campo', 'Fertilización', 'Prácticas']) {
        expect(modis[2]).toContain(place);
      }

      // el catálogo solo lista pasadas; la hidrología entra a un modelo sin validar
      expect(flow('cmr')[1]).toContain('Sin bajar imágenes');
      expect(flow('cmr')[2]).toContain('Solo un listado');
      const water = flow('hydrology');
      expect(water[1]).toContain('forcing.json');
      expect(water[1]).toContain('OPeNDAP');
      expect(water[2]).toContain('Cuenca y Caudal');
      expect(water[2]).toContain('Modelo sin validar');
    });

    it('las fuentes van en pestañas: una a la vista, que cambia con un toque o con las flechas', async () => {
      await setup();
      const selected = () =>
        tabs()
          .filter((tab) => tab.getAttribute('aria-selected') === 'true')
          .map(clean);
      const visible = () =>
        panels()
          .filter((panel) => !panel.hidden)
          .map((panel) => panel.id);
      const press = async (key: string) => {
        tabs()
          .find((tab) => tab.tabIndex === 0)!
          .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await fixture.whenStable();
      };

      // arranca en NISAR, el sensor principal, y solo esa pestaña entra con Tab
      expect(selected()).toEqual(['NISAR']);
      expect(visible()).toEqual(['docs-panel-nisar']);
      expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);

      tabs()[3].click();
      await fixture.whenStable();
      expect(selected()).toEqual(['NASA POWER']);
      expect(visible()).toEqual(['docs-panel-power']);

      await press('ArrowRight');
      expect(selected()).toEqual(['CMR']);
      expect(document.activeElement).toBe(tabs()[4]);
      await press('End');
      expect(selected()).toEqual(['IMERG · SMAP · MOD16']);
      // al final da la vuelta
      await press('ArrowRight');
      expect(selected()).toEqual(['NISAR']);
      await press('ArrowLeft');
      expect(selected()).toEqual(['IMERG · SMAP · MOD16']);
      await press('Home');
      expect(selected()).toEqual(['NISAR']);
      expect(visible()).toEqual(['docs-panel-nisar']);
      expect(document.activeElement).toBe(tabs()[0]);
    });

    it('la tecnología lleva sus logos en sus colores, con nombre accesible, y ninguno es de la NASA', async () => {
      await setup();

      const stack = group('docs-stack');
      const cards = [...stack.querySelectorAll('.tool')];
      expect(cards.map((card) => clean(card.querySelector('h4')))).toEqual([
        'Angular 22 · PWA',
        'Cloudflare Workers',
        'Railway + GitHub Actions',
        'PostgreSQL',
        'Python · Django y DRF',
        'Pipeline en Python',
      ]);
      expect(
        cards.map((card) =>
          [...card.querySelectorAll('svg[role="img"]')].map((logo) =>
            logo.getAttribute('aria-label'),
          ),
        ),
      ).toEqual([
        ['Angular', 'PWA'],
        ['Cloudflare'],
        ['Railway', 'GitHub Actions'],
        ['PostgreSQL'],
        ['Python', 'Django'],
        ['Python', 'NumPy'],
      ]);

      // dibujados en la página con el color de marca: nada se pide a terceros
      const fills = (name: string) =>
        [...stack.querySelectorAll(`svg[aria-label="${name}"] path`)].map((path) =>
          path.getAttribute('fill'),
        );
      expect(fills('PostgreSQL')).toEqual(['#4169E1']);
      expect(fills('Cloudflare')).toEqual(['#F38020']);
      expect(fills('GitHub Actions')).toEqual(['#2088FF']);
      // python con sus dos serpientes, azul y amarilla, en las dos tarjetas
      expect(fills('Python')).toEqual(['#3776AB', '#FFD43B', '#3776AB', '#FFD43B']);
      // angular con el degradé de su logo y el rojo de respaldo
      expect(fills('Angular')).toEqual(['url(#landing-logo-angular) #E40035']);
      const stops = [...stack.querySelectorAll('#landing-logo-angular stop')];
      expect(stops.map((stop) => stop.getAttribute('stop-color'))).toContain('#6C00F5');
      for (const logo of stack.querySelectorAll('svg[role="img"]')) {
        expect(logo.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(logo.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
      }
      expect(docs().querySelectorAll('img, image, use, [src]')).toHaveLength(0);

      // de la NASA, los datos sí y los logos no: sus fuentes llevan los íconos de la app, que son
      // dibujo, y ningún nombre accesible de la página es el de la NASA o el de una misión
      const nasa = group('docs-nasa');
      expect(nasa.querySelectorAll('[role="img"], img')).toHaveLength(0);
      for (const drawing of nasa.querySelectorAll('svg')) {
        expect(drawing.closest('app-icon')?.getAttribute('aria-hidden')).toBe('true');
      }
      const names = [...el().querySelectorAll('[role="img"], img')].map(
        (node) => node.getAttribute('aria-label') ?? node.getAttribute('alt') ?? '',
      );
      expect(
        names.filter((name) => /nasa|nisar|isro|earthdata|landsat|modis|smap|gpm/i.test(name)),
      ).toEqual([]);

      expect(docs().querySelector('a.link-arrow')?.getAttribute('href')).toBe('/ayuda');
    });
  });

  it('es honesta: usa datos abiertos de la NASA, sin aval ni certificados', async () => {
    await setup();

    expect(text()).toContain('Usa datos abiertos de la NASA');
    expect(text()).toContain('No está afiliado a la NASA ni cuenta con su aval');
    expect(text()).not.toMatch(/certific/i);
  });
});
