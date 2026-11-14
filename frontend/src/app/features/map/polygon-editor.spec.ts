import { PolygonEditor } from './polygon-editor';

describe('PolygonEditor', () => {
  it('agrega al final y avisa cuántos vértices faltan', () => {
    const editor = new PolygonEditor();
    editor.add([1, 1]);
    editor.add([2, 2]);
    expect(editor.points).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(editor.missingVertices).toBe(1);
  });

  it('inserta al lado del vértice seleccionado y avanza la selección', () => {
    const editor = new PolygonEditor([
      [0, 0],
      [0, 2],
      [2, 2],
    ]);
    editor.toggleSelect(0);
    editor.add([0, 1]);
    expect(editor.points[1]).toEqual([0, 1]);
    expect(editor.selected).toBe(1);
  });

  it('borra un vértice y corrige la selección', () => {
    const editor = new PolygonEditor([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    editor.toggleSelect(2);
    editor.remove(0);
    expect(editor.points.length).toBe(2);
    expect(editor.selected).toBe(1);
  });

  it('deshace y rehace movimientos, altas y limpieza', () => {
    const editor = new PolygonEditor();
    editor.add([0, 0]);
    editor.add([1, 1]);
    editor.move(1, [5, 5]);
    editor.clear();
    expect(editor.points.length).toBe(0);
    editor.undo();
    expect(editor.points[1]).toEqual([5, 5]);
    editor.undo();
    expect(editor.points[1]).toEqual([1, 1]);
    editor.redo();
    expect(editor.points[1]).toEqual([5, 5]);
    expect(editor.canRedo).toBe(true);
  });

  it('una edición nueva descarta lo que se podía rehacer', () => {
    const editor = new PolygonEditor();
    editor.add([0, 0]);
    editor.undo();
    editor.add([3, 3]);
    expect(editor.canRedo).toBe(false);
  });

  it('mover a la misma posición no ensucia el historial', () => {
    const editor = new PolygonEditor([[1, 1]]);
    editor.move(0, [1, 1]);
    expect(editor.canUndo).toBe(false);
  });
});
