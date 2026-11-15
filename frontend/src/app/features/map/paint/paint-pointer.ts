import * as L from 'leaflet';

/** lo que hace quien usa PaintPointer con cada gesto */
export interface PaintPointerHandlers {
  /** apoyó el puntero: empieza un trazo en ese punto */
  start(latlng: L.LatLng): void;
  /** el trazo en curso pasó por este punto */
  move(latlng: L.LatLng): void;
  /** soltó: el trazo termina */
  end(): void;
  /** apoyó un segundo dedo: el trazo se descarta porque es un pellizco de zoom */
  cancel(): void;
  /** el cursor está sobre este punto sin pintar, o se fue del mapa (null) */
  hover(latlng: L.LatLng | null): void;
}

/**
 * traduce los pointer events del mapa a trazos de pintura
 *
 * con el mouse o el lápiz, apretar y arrastrar pinta. en pantallas táctiles un dedo pinta y dos
 * dedos los maneja leaflet (zoom y desplazamiento): al apoyar el segundo, el trazo se descarta.
 * la rueda no se toca, así que sigue haciendo zoom. desactivado no hace nada
 */
export class PaintPointer {
  private enabled = false;
  private active: number | null = null;
  private readonly touches = new Set<number>();
  private readonly element: HTMLElement;

  constructor(
    private readonly map: L.Map,
    private readonly handlers: PaintPointerHandlers,
  ) {
    this.element = map.getContainer();
    this.element.addEventListener('pointerdown', this.onDown);
    this.element.addEventListener('pointermove', this.onMove);
    this.element.addEventListener('pointerup', this.onUp);
    this.element.addEventListener('pointercancel', this.onUp);
    this.element.addEventListener('pointerleave', this.onLeave);
  }

  get painting(): boolean {
    return this.active !== null;
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) this.finish();
    if (!enabled) this.handlers.hover(null);
    this.enabled = enabled;
  }

  /** termina el trazo en curso, si hay uno */
  finish(): void {
    if (this.active === null) return;
    this.release(this.active);
    this.active = null;
    this.handlers.end();
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onUp);
    this.element.removeEventListener('pointerleave', this.onLeave);
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      // el primer dedo de un gesto nuevo: se olvidan dedos que se levantaron fuera del mapa
      if (event.isPrimary) this.touches.clear();
      this.touches.add(event.pointerId);
    }
    if (!this.enabled || !this.isPaintTarget(event)) return;
    if (this.touches.size > 1) {
      // segundo dedo: es un pellizco, no un trazo
      if (this.active !== null) {
        this.release(this.active);
        this.active = null;
        this.handlers.cancel();
      }
      return;
    }
    if (event.pointerType !== 'touch' && event.button !== 0) return;
    if (this.active !== null) return;
    this.active = event.pointerId;
    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      // sin captura igual se pinta mientras el puntero siga sobre el mapa
    }
    this.handlers.start(this.map.mouseEventToLatLng(event));
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId === this.active) {
      this.handlers.move(this.map.mouseEventToLatLng(event));
    } else if (this.enabled && this.active === null && event.pointerType !== 'touch') {
      this.handlers.hover(this.isPaintTarget(event) ? this.map.mouseEventToLatLng(event) : null);
    }
  };

  private readonly onUp = (event: PointerEvent): void => {
    this.touches.delete(event.pointerId);
    if (event.pointerId !== this.active) return;
    this.release(event.pointerId);
    this.active = null;
    this.handlers.end();
  };

  private readonly onLeave = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') this.touches.delete(event.pointerId);
    if (this.active === null) this.handlers.hover(null);
  };

  // los controles de leaflet (zoom, capas, atribución) están adentro del contenedor
  private isPaintTarget(event: PointerEvent): boolean {
    const target = event.target as Element | null;
    return !target?.closest?.('.leaflet-control');
  }

  private release(pointerId: number): void {
    try {
      if (this.element.hasPointerCapture?.(pointerId))
        this.element.releasePointerCapture(pointerId);
    } catch {
      // ya estaba liberado
    }
  }
}
