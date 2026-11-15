import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideSignedInTesting } from '../../core/auth/testing';
import { provideOfflineTesting } from '../../core/offline/testing';
import { LandingPage } from './landing-page';

const TITLE =
  'An ecosystem that empowers farmers and advisors to monitor simplified NASA data, footprints, fertilization and profitability';

/** palabras y letras del español: en la landing no tiene que quedar ninguna a la vista */
const SPANISH =
  /[áéíóúñ¿¡]|\b(el|los|las|del|y|con|para|sin|una?|lotes?|campo|datos|cuenta|ingresar|gratis|recorrido)\b/i;

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

  it('lleva el título en inglés exacto, con las palabras clave resaltadas, para productores y asesores', async () => {
    await setup();

    const h1 = el().querySelector('h1')!;
    expect(h1.textContent?.replace(/\s+/g, ' ').trim()).toBe(TITLE);
    expect([...h1.querySelectorAll('strong')].map((s) => s.textContent?.trim())).toEqual([
      'simplified NASA data',
      'footprints',
      'fertilization',
      'profitability',
    ]);
    expect(el().querySelector('.hero__tag')?.textContent?.trim()).toBe(
      'For crop farmers, ranchers and advisors',
    );
  });

  it('toda la landing está en inglés y lo dice: lang="en" y nada en español a la vista ni para el lector de pantalla', async () => {
    await setup();

    expect(el().getAttribute('lang')).toBe('en');
    expect(text()).not.toMatch(SPANISH);
    const names = [...el().querySelectorAll('[aria-label], [alt], [label], [title]')].flatMap(
      (node) =>
        ['aria-label', 'alt', 'label', 'title']
          .map((name) => node.getAttribute(name))
          .filter((value): value is string => !!value),
    );
    expect(names).toContain('LoTestigo, home');
    for (const name of names) expect(name).not.toMatch(SPANISH);
  });

  it('cuenta los tres pasos, el primero marcar el perímetro', async () => {
    await setup();

    const steps = [...el().querySelectorAll('.steps > li h3')].map((h) => h.textContent?.trim());
    expect(steps).toEqual([
      "Mark your field's boundary",
      'See NASA data, simplified',
      'Check footprint, fertilization and profitability',
    ]);
    expect(el().querySelector('#steps-title')?.textContent?.trim()).toBe('How it works');
    expect(text()).not.toMatch(/\bpaint/i);
  });

  it('poco texto a la vista: sin bajada en el título, cada paso y la sección de datos en una línea corta', async () => {
    await setup();

    const short = (selector: string) =>
      [...el().querySelectorAll(selector)].map((p) => p.textContent!.replace(/\s+/g, ' ').trim());
    // al lado del video quedan solo las acciones
    expect(el().querySelector('.hero__lead')).toBeNull();
    expect(el().querySelectorAll('.hero__side p')).toHaveLength(0);
    const lines = [...short('.steps > li p'), ...short('.section__lead')];
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(90);
    // las estimaciones se dicen como tales, sin afirmar más de lo que son
    expect(short('.steps > li p')[2]).toContain('These are estimates');
  });

  it('sin sesión: una acción principal para crear la cuenta, ingresar al lado y un ejemplo', async () => {
    await setup();

    expect(heroLinks()).toEqual({
      'Create a free account': '/registrarse',
      'I already have an account': '/ingresar',
      'See a sample field': '/ejemplos',
    });
    const primary = el().querySelectorAll('.hero .btn--primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent?.trim()).toBe('Create a free account');
    expect(el().querySelector('.bar a[href="/ingresar"]')?.textContent?.trim()).toBe('Log in');
    // el cierre: el título y la acción, sin la línea de abajo
    const final = el().querySelector('.final')!;
    expect(final.querySelector('h2')?.textContent?.trim()).toBe('Try it on your field');
    expect(final.querySelectorAll('p')).toHaveLength(0);
    expect(final.querySelector('a.btn--primary')?.textContent?.trim()).toBe(
      'Create a free account',
    );
    expect(final.querySelector('a.btn--primary')?.getAttribute('href')).toBe('/registrarse');
  });

  it('con la sesión abierta lleva a su campo', async () => {
    await setup(true);

    expect(heroLinks()).toEqual({
      'Go to my fields': '/mapa',
      'See a sample field': '/ejemplos',
    });
    expect(el().querySelector('.bar a[href="/mapa"]')?.textContent?.trim()).toBe('Go to my fields');
    expect(el().querySelector('.final h2')?.textContent?.trim()).toBe('Your fields are waiting');
    expect(el().querySelector('.final a.btn--primary')?.getAttribute('href')).toBe('/mapa');
    expect(text()).not.toContain('Create a free account');
    expect(el().querySelector('a[href="/ingresar"]')).toBeNull();
  });

  it('la marca muestra las tres capas, nítidas en 2x y 3x, sin repetir el nombre ni saltar al cargar', async () => {
    await setup();

    const brand = el().querySelector<HTMLAnchorElement>('.bar .brand')!;
    expect(brand.textContent?.trim()).toBe('LoTestigo');
    expect(brand.getAttribute('aria-label')).toBe('LoTestigo, home');
    expect(brand.querySelector('svg')).toBeNull();
    const logo = brand.querySelector<HTMLImageElement>('img.brand-logo')!;
    expect(logo.getAttribute('src')).toBe('/lotestigo-mark-32.png');
    expect(logo.getAttribute('srcset')).toBe(
      '/lotestigo-mark-32.png 1x, /lotestigo-mark-64.png 2x, /lotestigo-mark-96.png 3x',
    );
    expect(logo.getAttribute('alt')).toBe('');
    expect([logo.getAttribute('width'), logo.getAttribute('height')]).toEqual(['28', '32']);
  });

  it('el recorrido: webm y mp4, póster, sin sonido, en línea, en bucle, con subtítulos en inglés y capítulos', async () => {
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
      label: track.getAttribute('label'),
      default: track.hasAttribute('default'),
    }));
    expect(trackAttrs).toEqual([
      {
        kind: 'captions',
        src: '/landing/demo.en.vtt',
        srclang: 'en',
        label: 'English',
        default: true,
      },
      {
        kind: 'chapters',
        src: '/landing/demo.chapters.vtt',
        srclang: 'en',
        label: 'Tour chapters',
        default: false,
      },
    ]);
    // los subtítulos en español ya no van
    expect(el().querySelector('track[src*=".es."], track[srclang="es"]')).toBeNull();
    // la descripción del video para quien no lo ve
    expect(el().querySelector('.demo figcaption')?.textContent).toContain('no sound');
    expect(el().querySelector('.demo figcaption')?.textContent).toContain('English captions');
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
    expect(toggle()?.getAttribute('aria-label')).toBe('Pause the tour');
    expect(toggle()?.classList).toContain('btn--icon');

    observer.show(0);
    await fixture.whenStable();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(toggle()?.getAttribute('aria-label')).toBe('Play the tour');
    observer.show(1);
    expect(play).toHaveBeenCalledTimes(2);

    // la persona lo pausa: aunque salga y vuelva a la pantalla, no arranca de nuevo
    toggle()!.click();
    await fixture.whenStable();
    expect(pause).toHaveBeenCalledTimes(2);
    expect(toggle()?.getAttribute('aria-label')).toBe('Play the tour');
    observer.show(0);
    observer.show(1);
    expect(play).toHaveBeenCalledTimes(2);

    toggle()!.click();
    await fixture.whenStable();
    expect(play).toHaveBeenCalledTimes(3);
    expect(toggle()?.getAttribute('aria-label')).toBe('Pause the tour');
  });

  it('con menos movimiento no arranca solo: queda el póster con un botón para verlo', async () => {
    restore = lessMotion();
    await setup();

    FakeObserver.last!.show(1);
    await fixture.whenStable();
    expect(play).not.toHaveBeenCalled();
    const start = el().querySelector<HTMLButtonElement>('.demo__start')!;
    expect(start.textContent?.trim()).toBe('Watch the tour');
    expect(start.getAttribute('type')).toBe('button');

    start.click();
    await fixture.whenStable();
    expect(play).toHaveBeenCalledTimes(1);
    expect(el().querySelector('.demo__start')).toBeNull();
    // el botón grande se va: el foco queda en el de pausa
    expect(document.activeElement).toBe(toggle());
    expect(toggle()?.getAttribute('aria-label')).toBe('Pause the tour');
  });

  it('si el navegador no lo deja arrancar solo, también ofrece el botón para verlo', async () => {
    play.mockImplementation(() =>
      Promise.reject(new DOMException('sin permiso', 'NotAllowedError')),
    );
    await setup();

    FakeObserver.last!.show(1);
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
    expect(el().querySelector('.demo__start')?.textContent?.trim()).toBe('Watch the tour');
  });

  it('los capítulos salen de la pista del video: saltan a su parte y marcan el que se ve', async () => {
    await setup();

    // la pista de capítulos se carga sin mostrarse; hasta que llega no hay capítulos
    expect(tracks[1].mode).toBe('hidden');
    expect(chips()).toHaveLength(0);
    tracks[1].cues = [
      { startTime: 0, endTime: 8, text: 'Mark your field' },
      { startTime: 8, endTime: 15, text: 'NASA data' },
      { startTime: 15, endTime: 24, text: '<b>Passport</b>' },
    ];
    video().querySelector('track[kind="chapters"]')!.dispatchEvent(new Event('load'));
    await fixture.whenStable();

    expect(chips().map((chip) => chip.textContent?.trim())).toEqual([
      'Mark your field',
      'NASA data',
      'Passport',
    ]);
    expect(el().querySelector('.demo__chapters')?.getAttribute('aria-label')).toBe('Tour chapters');
    expect(current()).toEqual(['Mark your field']);

    video().currentTime = 11.5;
    video().dispatchEvent(new Event('timeupdate'));
    await fixture.whenStable();
    expect(current()).toEqual(['NASA data']);
    expect(chips()[1].style.getPropertyValue('--p')).toBe('0.5');

    chips()[2].click();
    await fixture.whenStable();
    expect(video().currentTime).toBe(15);
    expect(play).toHaveBeenCalledTimes(1);
    expect(current()).toEqual(['Passport']);
  });

  it('si el video no carga queda la imagen satelital, sin crédito a la vista ni controles rotos', async () => {
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
    // lo que muestra lo dice el alt, en inglés como el resto
    expect(img.alt).toContain('between Casilda and Rosario');
    expect(img.alt).not.toMatch(/31\/10\/2026|GIBS/);
    expect(el().querySelector('.demo__credit')).toBeNull();
    expect(el().querySelector('.demo__screen')?.textContent?.trim()).toBe('');
    expect(toggle()).toBeNull();
    expect(el().querySelector('.demo__start')).toBeNull();
    FakeObserver.last!.show(1);
    expect(play).not.toHaveBeenCalled();
  });

  it('el cierre lleva la imagen satelital de fondo, decorativa, sin crédito y con carga diferida', async () => {
    await setup();

    const img = el().querySelector<HTMLImageElement>('.final img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['1200', '750']);
    expect(img.getAttribute('srcset')).toContain('/zona-nucleo-landsat-1200.webp 1200w');
    // de fondo es decorativa: el lector de pantalla la saltea
    expect(img.getAttribute('alt')).toBe('');
    expect(el().querySelector('.final__credit')).toBeNull();
    expect(el().querySelector('.final')?.textContent).not.toMatch(/landsat|GIBS|31\/10\/2026/i);
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

      expect(el().querySelector('#docs-title')?.textContent).toContain('Documentation');
      expect(clean(docs().querySelector('#docs-nasa'))).toBe('How we connect to NASA');
      expect(el().querySelector('img[src*="lotestigo-datos-nasa"]')).toBeNull();
      const paths = [...docs().querySelectorAll('.path')];
      expect(paths.map((path) => clean(path.querySelector('.chip')))).toEqual([
        'Live',
        'Pre-processed',
      ]);
      expect(paths.map((path) => clean(path.querySelector('.path__head strong')))).toEqual([
        'From the browser',
        'In Python: radar and hydrology',
      ]);
      expect(paths.map((path) => [...path.querySelectorAll('.path__nodes li')].map(clean))).toEqual(
        [
          ['NASA, no login', 'Browser', 'Saved on the device', 'Screen'],
          ['Earthdata, with login', 'Python pipeline', 'Django and PostgreSQL', 'App'],
        ],
      );
      // las flechas entre uno y otro son dibujo: el lector de pantalla no las lee
      for (const path of paths) {
        expect(path.querySelectorAll('.path__nodes app-icon[aria-hidden="true"]')).toHaveLength(3);
      }
      expect(clean(paths[0].querySelector('.path__note'))).toBe(
        "MODIS, NASA POWER and CMR, over HTTPS and JSON. They don't go through the backend.",
      );
      expect(clean(paths[1].querySelector('.path__note'))).toContain(
        'NISAR, HLS, IMERG, SMAP and MOD16',
      );
    });

    it('cada fuente de la NASA cuenta en tres pasos de dónde sale, cómo llega y qué muestra la app', async () => {
      await setup();

      expect(docs().querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
        'NASA data sources',
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
          'Where it comes from',
          'How it arrives',
          'In the app',
        ]);
        // poco texto a la vista: una línea corta por paso y lo técnico en fichas
        for (const step of steps) {
          expect(clean(step.querySelector('.step__text')).length).toBeLessThanOrEqual(50);
          const tags = [...step.querySelectorAll('.tags li')].map(clean);
          expect(tags.length).toBeGreaterThan(0);
          for (const tag of tags) expect(tag.length).toBeLessThanOrEqual(24);
        }
        // el último paso dice con qué origen lo muestra la app, o por qué no lleva uno
        expect(steps[2].querySelector('.origin, .chip')).toBeTruthy();
      });

      // cada una dice su camino: en vivo desde el navegador o procesada aparte
      const live = (id: string) =>
        clean(docs().querySelector(`#docs-panel-${id} .panel__head .chip`));
      expect(['nisar', 'hls', 'modis', 'power', 'cmr', 'hydrology'].map(live)).toEqual([
        'Pre-processed',
        'Pre-processed',
        'Live',
        'Live',
        'Live',
        'Pre-processed',
      ]);

      // NASA POWER: el navegador pide la API por HTTPS, guarda una copia y Satellite lo muestra estimado
      const power = flow('power');
      expect(power[1]).toContain("The browser gets weather for the field's center");
      for (const tag of ['REST API', 'HTTPS · JSON', 'Saved on the device']) {
        expect(power[1]).toContain(tag);
      }
      expect(power[2]).toContain('30-day rainfall and soil moisture');
      expect(power[2]).toContain('Satellite');
      expect(power[2]).toContain('Estimated');
      expect(docs().querySelector('#docs-panel-power .origin--estimated')).toBeTruthy();

      // NISAR: de Earthdata al pipeline, de ahí a la base con import_events y a la bitácora
      const nisar = flow('nisar');
      expect(nisar[0]).toContain('ASF DAAC');
      expect(nisar[1]).toContain('Earthdata Login');
      expect(nisar[1]).toContain('import_events');
      expect(nisar[2]).toContain('Field log');
      expect(nisar[2]).toContain('Verified');
      expect(docs().querySelector('#docs-panel-nisar .origin--verified')).toBeTruthy();

      // MODIS va en vivo por el ORNL DAAC a cuatro pantallas
      const modis = flow('modis');
      expect(modis[0]).toContain('ORNL DAAC');
      for (const place of ['Satellite', 'My fields', 'Fertilization', 'Practices']) {
        expect(modis[2]).toContain(place);
      }

      // el catálogo solo lista pasadas; la hidrología entra a un modelo sin validar
      expect(flow('cmr')[1]).toContain('No image downloads');
      expect(flow('cmr')[2]).toContain('List only');
      const water = flow('hydrology');
      expect(water[1]).toContain('forcing.json');
      expect(water[1]).toContain('OPeNDAP');
      expect(water[2]).toContain('Watershed');
      expect(water[2]).toContain('Unvalidated model');
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
        'Python · Django and DRF',
        'Python pipeline',
      ]);
      expect(clean(docs().querySelector('#docs-stack'))).toBe('Technology built to scale');
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

      const guide = docs().querySelector('a.link-arrow');
      expect(guide?.getAttribute('href')).toBe('/ayuda');
      expect(clean(guide)).toBe('How each data source is loaded: the illustrated guide');
    });
  });

  it('sin los cuatro textos que se sacaron (ni su traducción) y sin hablar de certificados', async () => {
    await setup();

    // la bajada del título, la línea del cierre, el crédito de la imagen y el pie
    expect(
      el().querySelector('.hero__lead, .final__credit, .demo__credit, footer, .foot'),
    ).toBeNull();
    expect(text()).not.toMatch(
      /with NASA open data|datos abiertos|privad|only you can see|solo vos|31\/10\/2026|EOSDIS|Space Apps|affiliat|afiliad|endors|\baval\b|VISEC|RTRS|2BSvs/i,
    );
    expect(text()).not.toMatch(/certif/i);
  });
});
