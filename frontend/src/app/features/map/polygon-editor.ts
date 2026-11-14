/**
 * Estado del dibujo de un polígono: vértices, vértice seleccionado e historial para deshacer.
 *
 * Es una clase sin Angular ni Leaflet para poder probarla sola. Los vértices van como
 * [latitud, longitud], el orden que usa Leaflet; la conversión a GeoJSON está en geo.ts.
 */

export type LatLng = [number, number];

export const MIN_VERTICES = 3;
const MAX_HISTORY = 50;

export class PolygonEditor {
  private _points: LatLng[] = [];
  private _selected: number | null = null;
  private past: LatLng[][] = [];
  private future: LatLng[][] = [];

  constructor(initial: LatLng[] = []) {
    this._points = copy(initial);
  }

  get points(): readonly LatLng[] {
    return this._points;
  }

  get selected(): number | null {
    return this._selected;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get missingVertices(): number {
    return Math.max(0, MIN_VERTICES - this._points.length);
  }

  /** Agrega un vértice al final, o al lado del seleccionado si hay uno (y lo selecciona). */
  add(point: LatLng): void {
    this.remember();
    if (this._selected !== null) {
      const at = this._selected + 1;
      this._points.splice(at, 0, [...point]);
      this._selected = at;
    } else {
      this._points.push([...point]);
    }
  }

  /** Mueve un vértice. Se llama al soltar el arrastre o al editar sus coordenadas. */
  move(index: number, point: LatLng): void {
    if (!this.has(index)) return;
    const [lat, lng] = this._points[index];
    if (lat === point[0] && lng === point[1]) return;
    this.remember();
    this._points[index] = [...point];
  }

  remove(index: number): void {
    if (!this.has(index)) return;
    this.remember();
    this._points.splice(index, 1);
    if (this._selected === index) {
      this._selected = null;
    } else if (this._selected !== null && this._selected > index) {
      this._selected -= 1;
    }
  }

  clear(): void {
    if (this._points.length === 0) return;
    this.remember();
    this._points = [];
    this._selected = null;
  }

  /** Selecciona un vértice, o lo deselecciona si ya estaba seleccionado. */
  toggleSelect(index: number): void {
    this._selected = this._selected === index || !this.has(index) ? null : index;
  }

  deselect(): void {
    this._selected = null;
  }

  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(copy(this._points));
    this.restore(previous);
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(copy(this._points));
    this.restore(next);
  }

  private has(index: number): boolean {
    return index >= 0 && index < this._points.length;
  }

  private remember(): void {
    this.past.push(copy(this._points));
    if (this.past.length > MAX_HISTORY) this.past.shift();
    this.future = [];
  }

  private restore(points: LatLng[]): void {
    this._points = points;
    if (this._selected !== null && this._selected >= points.length) {
      this._selected = null;
    }
  }
}

function copy(points: readonly LatLng[]): LatLng[] {
  return points.map(([lat, lng]) => [lat, lng]);
}
