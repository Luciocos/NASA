import { CellSet } from './cell-set';
import { GridEditor } from './grid-editor';
import { Cell } from './hectare-grid';
import { MAX_LINE_CELLS } from './raster';
import { cellsFromArt, sortedKeys } from './testing';

/** pinta o borra un trazo completo que pasa por las celdas dadas */
function stroke(editor: GridEditor, mode: 'paint' | 'erase', ...cells: Cell[]): boolean {
  editor.beginStroke(mode);
  for (const cell of cells) editor.strokeTo(cell);
  return editor.endStroke();
}

describe('GridEditor: trazos', () => {
  it('empieza vacío, o con las celdas iniciales fuera del historial', () => {
    const empty = new GridEditor();
    expect(empty.size).toBe(0);
    expect(empty.canUndo).toBe(false);
    expect(empty.canRedo).toBe(false);
    expect(empty.strokeMode).toBeNull();

    const initial = new GridEditor([
      [0, 0],
      [1, 0],
    ]);
    expect(initial.size).toBe(2);
    expect(initial.canUndo).toBe(false);
    expect(initial.undo()).toBe(false);
    expect(initial.size).toBe(2);
  });

  it('pinta la celda del primer punto del trazo', () => {
    const editor = new GridEditor();
    editor.beginStroke('paint');
    expect(editor.strokeMode).toBe('paint');
    expect(editor.strokeTo([3, 4])).toBe(true);
    expect(editor.cells.has([3, 4])).toBe(true);
    expect(editor.size).toBe(1);
    expect(editor.endStroke()).toBe(true);
    expect(editor.strokeMode).toBeNull();
  });

  it('un arrastre rápido pinta todas las celdas del camino, unidas por lados', () => {
    const editor = new GridEditor();
    editor.beginStroke('paint');
    editor.strokeTo([0, 0]);
    expect(editor.strokeTo([4, 0])).toBe(true);
    expect(editor.strokeTo([6, 3])).toBe(true);
    editor.endStroke();
    // 5 celdas en fila y después 5 más de la escalera (la [4, 0] ya estaba)
    expect(editor.size).toBe(10);
    for (const cell of [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [6, 3],
    ] as Cell[]) {
      expect(editor.cells.has(cell)).toBe(true);
    }
    const cells = [...editor.cells];
    for (let k = 1; k < cells.length; k++) {
      const step =
        Math.abs(cells[k][0] - cells[k - 1][0]) + Math.abs(cells[k][1] - cells[k - 1][1]);
      expect(step).toBe(1);
    }
  });

  it('un trazo entero es una sola entrada del historial', () => {
    const editor = new GridEditor();
    stroke(editor, 'paint', [0, 0], [5, 0], [5, 5]);
    expect(editor.size).toBe(11);
    expect(editor.canUndo).toBe(true);
    expect(editor.undo()).toBe(true);
    expect(editor.size).toBe(0);
    expect(editor.canUndo).toBe(false);
    expect(editor.redo()).toBe(true);
    expect(editor.size).toBe(11);
    expect(editor.canRedo).toBe(false);
  });

  it('strokeTo avisa si cambió algo, para saber si hay que redibujar', () => {
    const editor = new GridEditor([[1, 0]]);
    editor.beginStroke('paint');
    expect(editor.strokeTo([1, 0])).toBe(false);
    expect(editor.strokeTo([1, 0])).toBe(false);
    expect(editor.strokeTo([2, 0])).toBe(true);
    expect(editor.strokeTo([2, 0])).toBe(false);
    // vuelve sobre lo ya pintado
    expect(editor.strokeTo([1, 0])).toBe(false);
    editor.endStroke();
    expect(editor.size).toBe(2);
  });

  it('un trazo que no cambió nada no entra al historial ni borra lo que se podía rehacer', () => {
    const editor = new GridEditor();
    stroke(editor, 'paint', [0, 0], [2, 0]);
    stroke(editor, 'paint', [5, 5]);
    editor.undo();
    expect(editor.canRedo).toBe(true);
    // pasa solo por celdas que ya estaban pintadas
    expect(stroke(editor, 'paint', [0, 0], [2, 0])).toBe(false);
    // borra donde no había nada
    expect(stroke(editor, 'erase', [9, 9], [9, 12])).toBe(false);
    // trazo sin ningún punto
    expect(stroke(editor, 'paint')).toBe(false);
    expect(editor.canRedo).toBe(true);
    editor.undo();
    expect(editor.size).toBe(0);
    expect(editor.canUndo).toBe(false);
  });

  it('borra con un trazo y lo deshace devolviendo solo lo que había', () => {
    const editor = new GridEditor(cellsFromArt(['#####', '#####', '#####']));
    expect(stroke(editor, 'erase', [-2, 1], [7, 1])).toBe(true);
    expect(sortedKeys(editor.cells)).toEqual(sortedKeys(cellsFromArt(['#####', '.....', '#####'])));
    editor.undo();
    expect(editor.size).toBe(15);
    expect(editor.cells.has([-1, 1])).toBe(false);
    expect(editor.cells.has([6, 1])).toBe(false);
    editor.redo();
    expect(editor.size).toBe(10);
  });

  it('empezar un trazo con otro en curso cierra el anterior', () => {
    const editor = new GridEditor();
    editor.beginStroke('paint');
    editor.strokeTo([0, 0]);
    editor.beginStroke('paint');
    editor.strokeTo([5, 5]);
    editor.endStroke();
    // son dos trazos: el segundo no se une con una línea al primero
    expect(editor.size).toBe(2);
    editor.undo();
    expect([...editor.cells]).toEqual([[0, 0]]);
    editor.undo();
    expect(editor.size).toBe(0);
  });

  it('sin un trazo en curso, strokeTo y endStroke no hacen nada', () => {
    const editor = new GridEditor();
    expect(editor.strokeTo([1, 1])).toBe(false);
    expect(editor.endStroke()).toBe(false);
    expect(editor.size).toBe(0);
    expect(editor.canUndo).toBe(false);
  });

  it('ignora celdas inválidas sin cortar el trazo', () => {
    const editor = new GridEditor();
    editor.beginStroke('paint');
    editor.strokeTo([0, 0]);
    expect(editor.strokeTo([Number.NaN, 0])).toBe(false);
    expect(editor.strokeTo([0.5, 0])).toBe(false);
    expect(editor.strokeTo([2, 0])).toBe(true);
    editor.endStroke();
    expect(sortedKeys(editor.cells)).toEqual(['0,0', '1,0', '2,0']);
  });

  it('un salto imposible de interpolar se toma como un punto suelto', () => {
    const editor = new GridEditor();
    editor.beginStroke('paint');
    editor.strokeTo([0, 0]);
    expect(editor.strokeTo([MAX_LINE_CELLS + 10, 0])).toBe(true);
    editor.endStroke();
    expect(editor.size).toBe(2);
  });

  it('mientras hay un trazo con cambios se puede deshacer pero no rehacer', () => {
    const editor = new GridEditor();
    stroke(editor, 'paint', [0, 0]);
    editor.undo();
    expect(editor.canRedo).toBe(true);
    editor.beginStroke('paint');
    expect(editor.canUndo).toBe(false);
    expect(editor.canRedo).toBe(true);
    editor.strokeTo([4, 4]);
    expect(editor.canUndo).toBe(true);
    expect(editor.canRedo).toBe(false);
    // deshacer en medio del trazo lo cierra y lo deshace entero
    expect(editor.undo()).toBe(true);
    expect(editor.size).toBe(0);
    expect(editor.strokeMode).toBeNull();
    expect(editor.redo()).toBe(true);
    expect([...editor.cells]).toEqual([[4, 4]]);
  });
});

describe('GridEditor: edición e historial', () => {
  it('toggle pinta y borra de a una celda, cada vez como una entrada', () => {
    const editor = new GridEditor();
    expect(editor.toggle([2, 2])).toBe(true);
    expect(editor.cells.has([2, 2])).toBe(true);
    expect(editor.toggle([2, 2])).toBe(true);
    expect(editor.size).toBe(0);
    editor.undo();
    expect(editor.cells.has([2, 2])).toBe(true);
    editor.undo();
    expect(editor.size).toBe(0);
    expect(editor.toggle([Number.NaN, 2])).toBe(false);
    expect(editor.canUndo).toBe(false);
  });

  it('clear borra todo, se puede deshacer y no hace nada si ya estaba vacío', () => {
    const editor = new GridEditor();
    expect(editor.clear()).toBe(false);
    expect(editor.canUndo).toBe(false);
    stroke(editor, 'paint', [0, 0], [3, 0]);
    expect(editor.clear()).toBe(true);
    expect(editor.size).toBe(0);
    editor.undo();
    expect(editor.size).toBe(4);
  });

  it('replaceAll cambia todas las celdas como una sola entrada', () => {
    const editor = new GridEditor(cellsFromArt(['###']));
    const next = cellsFromArt(['.##', '.##']);
    expect(editor.replaceAll(next)).toBe(true);
    expect(sortedKeys(editor.cells)).toEqual(sortedKeys(next));
    // el editor guarda su propia copia
    next.add([9, 9]);
    expect(editor.cells.has([9, 9])).toBe(false);
    editor.undo();
    expect(sortedKeys(editor.cells)).toEqual(sortedKeys(cellsFromArt(['###'])));
    editor.redo();
    expect(editor.size).toBe(4);
  });

  it('replaceAll con las mismas celdas no entra al historial', () => {
    const editor = new GridEditor(cellsFromArt(['###']));
    expect(editor.replaceAll(cellsFromArt(['###']))).toBe(false);
    expect(editor.replaceAll(editor.cells)).toBe(false);
    expect(editor.canUndo).toBe(false);
    expect(() => editor.replaceAll([[0.5, 0]])).toThrow(RangeError);
    expect(editor.size).toBe(3);
  });

  it('una edición nueva descarta lo que se podía rehacer', () => {
    const editor = new GridEditor();
    stroke(editor, 'paint', [0, 0]);
    editor.undo();
    editor.toggle([3, 3]);
    expect(editor.canRedo).toBe(false);
    expect(editor.redo()).toBe(false);
    expect([...editor.cells]).toEqual([[3, 3]]);
  });

  it('deshace y rehace una secuencia mezclada volviendo siempre al mismo estado', () => {
    const editor = new GridEditor();
    const snapshots: CellSet[] = [editor.cells.clone()];
    const record = () => snapshots.push(editor.cells.clone());
    stroke(editor, 'paint', [0, 0], [6, 0], [6, 4]);
    record();
    stroke(editor, 'erase', [3, -1], [3, 2]);
    record();
    editor.toggle([10, 10]);
    record();
    editor.replaceAll(cellsFromArt(['##', '##']));
    record();
    editor.clear();
    record();
    for (let k = snapshots.length - 2; k >= 0; k--) {
      expect(editor.undo()).toBe(true);
      expect(sortedKeys(editor.cells)).toEqual(sortedKeys(snapshots[k]));
    }
    expect(editor.undo()).toBe(false);
    for (let k = 1; k < snapshots.length; k++) {
      expect(editor.redo()).toBe(true);
      expect(sortedKeys(editor.cells)).toEqual(sortedKeys(snapshots[k]));
    }
    expect(editor.redo()).toBe(false);
  });

  it('el historial guarda como mucho 50 entradas', () => {
    const editor = new GridEditor();
    for (let n = 0; n < 60; n++) editor.toggle([n, 0]);
    expect(editor.size).toBe(60);
    let undone = 0;
    while (editor.undo()) undone++;
    expect(undone).toBe(50);
    // las 10 primeras celdas ya no se pueden deshacer
    expect(editor.size).toBe(10);
    expect(editor.cells.has([9, 0])).toBe(true);
    expect(editor.cells.has([10, 0])).toBe(false);
  });

  it('cells es siempre el mismo objeto, y una copia no cambia con el editor', () => {
    const editor = new GridEditor();
    const live = editor.cells;
    const before = live.clone();
    stroke(editor, 'paint', [0, 0], [2, 0]);
    expect(editor.cells).toBe(live);
    expect(live.size).toBe(3);
    expect(before.size).toBe(0);
    expect(editor.size).toBe(3);
  });

  it('pinta miles de celdas en un trazo y las deshace de una vez', () => {
    const editor = new GridEditor();
    editor.beginStroke('paint');
    for (let j = 0; j < 100; j++) {
      editor.strokeTo([j % 2 === 0 ? 0 : 99, j]);
      editor.strokeTo([j % 2 === 0 ? 99 : 0, j]);
    }
    editor.endStroke();
    expect(editor.size).toBe(10_000);
    editor.undo();
    expect(editor.size).toBe(0);
    editor.redo();
    expect(editor.size).toBe(10_000);
  });
});
