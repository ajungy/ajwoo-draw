import { describe, expect, it } from 'vitest';
import { EditorStore } from '../src/app/store';
import { translateObject } from '../src/document/model/objects';
import { pen, shape } from './factories';

describe('undo and redo', () => {
  it('undoes and redoes object creation', () => {
    const store = new EditorStore();
    store.addObject(pen());
    expect(store.page.objects).toHaveLength(1);

    store.undo();
    expect(store.page.objects).toHaveLength(0);
    store.redo();
    expect(store.page.objects).toHaveLength(1);
  });

  it('treats a whole drag as a single undo step', () => {
    const store = new EditorStore();
    const box = shape();
    store.addObject(box, { select: true });

    // A drag amends rather than committing, exactly as the controller does.
    let current = box;
    for (let i = 0; i < 20; i++) {
      current = translateObject(current, 1, 1) as typeof box;
      store.updateObject(current, false);
    }
    expect((store.objectById(box.id) as typeof box).frame.x).toBe(20);

    store.undo();
    // One undo returns to before the shape existed, not to frame.x === 19.
    expect(store.page.objects).toHaveLength(0);
  });

  it('groups a continuous pen stroke into one history entry', () => {
    const store = new EditorStore();
    store.addObject(pen());
    store.addObject(pen());
    store.undo();
    expect(store.page.objects).toHaveLength(1);
    expect(store.canUndo).toBe(true);
  });

  it('drops the redo branch once new work happens', () => {
    const store = new EditorStore();
    store.addObject(pen());
    store.undo();
    expect(store.canRedo).toBe(true);
    store.addObject(shape());
    expect(store.canRedo).toBe(false);
  });

  it('undoes page operations', () => {
    const store = new EditorStore();
    store.addPage();
    expect(store.doc.pages).toHaveLength(2);
    store.undo();
    expect(store.doc.pages).toHaveLength(1);
    // The current page must still exist after time travel.
    expect(store.doc.pages.some((p) => p.id === store.currentPageId)).toBe(true);
  });

  it('prunes selection that no longer exists after undo', () => {
    const store = new EditorStore();
    const stroke = pen();
    store.addObject(stroke, { select: true });
    store.undo();
    expect(store.selection).toEqual([]);
  });
});
