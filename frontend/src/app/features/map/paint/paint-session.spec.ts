import { Cell } from '../grid';
import { PaintSession, clampRotation, gridAngleFor, longestSideDeg } from './paint-session';

const ORIGIN: [number, number] = [-33.05, -61.2];

function paint(session: PaintSession, ...cells: Cell[]): void {
  session.beginStroke('paint');
  cells.forEach((cell) => session.strokeTo(cell));
  session.endStroke();
}

describe('PaintSession', () => {
  it('cuenta hectáreas, perímetro y sectores', () => {
    const session = new PaintSession(ORIGIN);
    paint(session, [0, 0], [4, 0]);
    expect(session.areaHa()).toBe(5);
    expect(session.perimeterM()).toBe(1200);
    expect(session.regionCount()).toBe(1);
    paint(session, [0, 3]);
    expect(session.regionCount()).toBe(2);
    expect(() => session.geometry()).toThrow();
    expect(session.keepLargestRegion()).toBe(true);
    expect(session.areaHa()).toBe(5);
    expect(session.geometry().type).toBe('Polygon');
  });

  it('deshace un cambio de grilla y vuelve a las celdas originales', () => {
    const session = new PaintSession(ORIGIN);
    paint(session, [0, 0], [3, 0]);
    session.previewGrid({ rotationDeg: 10 });
    session.previewGrid({ rotationDeg: 20 });
    session.commitGrid();
    expect(session.rotationDeg).toBe(20);
    expect(session.cells.size).toBeGreaterThan(0);

    expect(session.undo()).toBe(true);
    expect(session.rotationDeg).toBe(0);
    expect([...session.cells].map(([i, j]) => `${i},${j}`)).toEqual(['0,0', '1,0', '2,0', '3,0']);

    expect(session.redo()).toBe(true);
    expect(session.rotationDeg).toBe(20);
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(true);
    expect(session.cells.size).toBe(0);
    expect(session.canUndo).toBe(false);
  });

  it('pasa de 1 ha a ¼ ha sin perder superficie', () => {
    const session = new PaintSession(ORIGIN);
    paint(session, [0, 0], [1, 0]);
    session.setGrid({ cellSize: 50 });
    expect(session.cells.size).toBe(8);
    expect(session.areaHa()).toBe(2);
  });

  it('descarta el trazo en curso al hacer un pellizco', () => {
    const session = new PaintSession(ORIGIN);
    session.beginStroke('paint');
    session.strokeTo([0, 0]);
    session.cancelStroke();
    expect(session.cells.size).toBe(0);
  });

  it('guarda y restaura una foto, y rechaza borradores que no sirven', () => {
    const session = new PaintSession(ORIGIN, { rotationDeg: -7.5, cellSize: 50 });
    paint(session, [2, 2], [2, 4]);
    const copy = PaintSession.restore(JSON.parse(JSON.stringify(session.snapshot())))!;
    expect(copy.rotationDeg).toBe(-7.5);
    expect(copy.cellSize).toBe(50);
    expect(copy.cells.equals(session.cells)).toBe(true);
    expect(PaintSession.restore({ ...session.snapshot(), cellSize: 30 })).toBeNull();
    expect(PaintSession.restore({ ...session.snapshot(), cells: [1] })).toBeNull();
    expect(PaintSession.restore(null)).toBeNull();
  });

  it('solo recentra la grilla si no hay nada pintado', () => {
    const session = new PaintSession(ORIGIN);
    expect(session.moveOrigin([-31.6, -60.7])).toBe(true);
    expect(session.origin).toEqual([-31.6, -60.7]);
    paint(session, [0, 0]);
    expect(session.moveOrigin(ORIGIN)).toBe(false);
  });
});

describe('alinear la grilla', () => {
  it('lleva cualquier dirección al rango de -45 a 45 grados', () => {
    expect(gridAngleFor(0)).toBe(0);
    expect(gridAngleFor(90)).toBe(0);
    expect(gridAngleFor(100)).toBe(10);
    expect(gridAngleFor(-130)).toBe(-40);
    expect(gridAngleFor(50)).toBe(-40);
    expect(clampRotation(60)).toBe(45);
    expect(clampRotation(-0.1)).toBe(0);
  });

  it('toma el lado más largo del anillo', () => {
    const ring: [number, number][] = [
      [0, 0],
      [100, 100],
      [90, 110],
      [-10, 10],
    ];
    expect(longestSideDeg(ring)).toBeCloseTo(45);
    expect(longestSideDeg([])).toBeNull();
  });
});
