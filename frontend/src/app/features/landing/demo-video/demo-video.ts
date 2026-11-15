import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { Icon } from '../../../shared/ui/icon/icon';

/** una parte del recorrido, tal como viene en demo.chapters.vtt */
export interface DemoChapter {
  title: string;
  /** segundos desde el principio del video */
  start: number;
  end: number;
}

/** imagen que ocupa el lugar del video si no carga */
export interface DemoFallback {
  src: string;
  srcset: string;
  alt: string;
  caption: string;
}

/** parte del video que tiene que verse para que arranque solo */
const VISIBLE_RATIO = 0.35;

/** los capítulos de una pista ya cargada, en orden y sin las etiquetas de formato del vtt */
export function chaptersFrom(track: TextTrack | undefined): DemoChapter[] {
  const cues = track?.cues;
  if (!cues) return [];
  return Array.from({ length: cues.length }, (_, i) => cues[i] as VTTCue)
    .map((cue) => ({
      title: cue.text.replace(/<[^>]*>/g, '').trim(),
      start: cue.startTime,
      end: cue.endTime,
    }))
    .filter((chapter) => chapter.title)
    .sort((a, b) => a.start - b.start);
}

function prefersLessMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** quien activó el ahorro de datos tampoco recibe el video sin pedirlo */
function savesData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * recorrido en video por la app, sin sonido y con subtítulos. arranca solo cuando se ve en
 * pantalla y se pausa cuando sale; con menos movimiento o ahorro de datos espera a que se toque
 * "Ver el recorrido". los capítulos salen de la pista del video (no se repiten los tiempos acá) y
 * cada uno salta a su parte. si el video no carga, queda la imagen satelital
 *
 * @example <app-demo-video [fallback]="image" />
 */
@Component({
  selector: 'app-demo-video',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './demo-video.html',
  styleUrl: './demo-video.css',
})
export class DemoVideo {
  readonly fallback = input.required<DemoFallback>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly toggleButton = viewChild<ElementRef<HTMLButtonElement>>('toggleButton');

  protected readonly chapters = signal<readonly DemoChapter[]>([]);
  protected readonly time = signal(0);
  protected readonly playing = signal(false);
  protected readonly failed = signal(false);
  /** no arrancó solo (menos movimiento, ahorro de datos o el navegador no lo dejó) */
  protected readonly askToPlay = signal(false);

  /** el capítulo que se está viendo, o -1 antes del primero */
  protected readonly current = computed(() => {
    const time = this.time();
    let found = -1;
    this.chapters().forEach((chapter, i) => {
      if (time >= chapter.start) found = i;
    });
    return found;
  });

  /** cuánto se vio del capítulo actual, de 0 a 1 */
  protected readonly progress = computed(() => {
    const chapter = this.chapters()[this.current()];
    if (!chapter || chapter.end <= chapter.start) return 0;
    const done = (this.time() - chapter.start) / (chapter.end - chapter.start);
    return Math.round(Math.min(Math.max(done, 0), 1) * 1000) / 1000;
  });

  private visible = false;
  /** sigue hasta que alguien lo pausa; arranca en falso si no corresponde que arranque solo */
  private wantsPlay = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const video = this.video().nativeElement;
      // el atributo muted no silencia un video creado desde el código: sin esto no arranca solo
      video.muted = true;
      const calm = prefersLessMotion() || savesData();
      this.wantsPlay = !calm;
      this.askToPlay.set(calm);
      this.readChapters();

      if (typeof IntersectionObserver === 'undefined') {
        this.visible = true;
        this.sync();
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          this.visible = entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO * 0.98;
          this.sync();
        },
        { threshold: [0, VISIBLE_RATIO] },
      );
      observer.observe(video);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** "Ver el recorrido" desaparece al arrancar: el foco pasa al botón de pausa y no se pierde */
  protected watch(): void {
    this.toggle();
    this.toggleButton()?.nativeElement.focus();
  }

  /** botón de pausa y reproducción: lo que elige la persona manda sobre el arranque solo */
  protected toggle(): void {
    const video = this.video().nativeElement;
    this.askToPlay.set(false);
    if (video.paused) {
      this.wantsPlay = true;
      this.start(video);
    } else {
      this.wantsPlay = false;
      video.pause();
    }
  }

  /** salta al principio de un capítulo y lo reproduce */
  protected seek(chapter: DemoChapter): void {
    const video = this.video().nativeElement;
    video.currentTime = chapter.start;
    this.time.set(chapter.start);
    this.askToPlay.set(false);
    this.wantsPlay = true;
    if (video.paused) this.start(video);
  }

  /** la pista de capítulos arranca apagada: en "hidden" el navegador la carga sin mostrarla */
  protected readChapters(): void {
    const tracks = Array.from(this.video().nativeElement.textTracks ?? []);
    const track = tracks.find((item) => item.kind === 'chapters');
    if (!track) return;
    if (track.mode === 'disabled') track.mode = 'hidden';
    const chapters = chaptersFrom(track);
    if (chapters.length) this.chapters.set(chapters);
  }

  protected onTime(): void {
    const before = this.current();
    this.time.set(this.video().nativeElement.currentTime);
    if (this.current() !== before) this.reveal(this.current());
  }

  /** en el celular los capítulos van en una fila que se desliza: el actual queda a la vista */
  private reveal(index: number): void {
    const list = this.list()?.nativeElement;
    const item = list?.children[index] as HTMLElement | undefined;
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    const left = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(left, 0), behavior: prefersLessMotion() ? 'auto' : 'smooth' });
  }

  /** reproduce mientras se ve y nadie lo pausó; si sale de la pantalla, se pausa */
  private sync(): void {
    const video = this.video().nativeElement;
    if (this.failed()) return;
    if (this.visible && this.wantsPlay) {
      if (video.paused) this.start(video);
    } else if (!video.paused) {
      video.pause();
    }
  }

  private start(video: HTMLVideoElement): void {
    // si el navegador no deja arrancar solo (por ejemplo, con ahorro de batería) queda el botón
    // grande. una pausa que llega antes de arrancar también corta el intento, y eso no es un error
    video.play()?.catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.wantsPlay = false;
        this.askToPlay.set(true);
      }
    });
  }
}
