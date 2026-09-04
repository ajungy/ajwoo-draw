import { describe, expect, it } from 'vitest';
import { EditorStore } from '../src/app/store';
import {
  hitTest,
  objectBounds,
  pickObject,
  resolveEndpoint,
  scaleObjectInto,
  translateObject,
} from '../src/document/model/objects';
import { resizeBounds } from '../src/canvas/interaction/controller';
import { line, pen, shape, text } from './factories';

const resizeBoundsForTest = resizeBounds;

describe('objects', () => {
  it('bounds a pen stroke including its stroke width', () => {
    const bounds = objectBounds(pen({ size: 10 }));
    expect(bounds.x).toBeCloseTo(-5);
    expect(bounds.w).toBeCloseTo(30);
  });

  it('hit-tests a stroke along its path, not just its bounding box', () => {
    const stroke = pen();
    expect(hitTest(stroke, { x: 10, y: 10 }, 2)).toBe(true);
    // Inside the bounding box, but far from the actual line.
    expect(hitTest(stroke, { x: 10, y: 1 }, 2)).toBe(false);
  });

  it('treats a shape as solid everywhere inside its frame, filled or not', () => {
    const hollow = shape();
    const filled = shape({ fill: '#FFFFFF' });
    const middle = { x: 50, y: 30 };
    expect(hitTest(hollow, middle, 2)).toBe(true);
    expect(hitTest(filled, middle, 2)).toBe(true);
    expect(hitTest(hollow, { x: 0, y: 30 }, 3)).toBe(true);
  });

  it('picks the topmost object under the pointer', () => {
    const under = shape({ fill: '#FFFFFF' });
    const over = shape({ fill: '#FFFFFF' });
    expect(pickObject([under, over], { x: 50, y: 30 }, 2)?.id).toBe(over.id);
  });

  it('moves every object type by the same delta', () => {
    expect(translateObject(shape(), 10, 5)).toMatchObject({ frame: { x: 10, y: 5 } });
    expect(translateObject(text(), 10, 5)).toMatchObject({ at: { x: 10, y: 5 } });
    expect(translateObject(line(), 10, 5)).toMatchObject({ a: { x: 10, y: 5 } });
    const moved = translateObject(pen(), 10, 5);
    expect(moved.type === 'pen' && moved.points[0]).toMatchObject({ x: 10, y: 5 });
  });

  it('scales an object from one bounds into another', () => {
    const scaled = scaleObjectInto(
      shape(),
      { x: 0, y: 0, w: 100, h: 60 },
      { x: 0, y: 0, w: 200, h: 120 },
    );
    expect(scaled).toMatchObject({ frame: { w: 200, h: 120 } });
  });

  it('resolves a bound connector endpoint to the shape edge facing the other end', () => {
    const box = shape({ frame: { x: 0, y: 0, w: 100, h: 100 } });
    const connector = line({
      a: { x: 300, y: 50 },
      b: { x: 0, y: 0 },
      endBinding: { objectId: box.id, anchor: 'center' },
    });
    const lookup = (id: string) => (id === box.id ? box : undefined);
    const end = resolveEndpoint(connector, 'end', lookup);
    // The other end is to the right, so the connector lands on the right edge.
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(50);
  });
});

describe('editing through the store', () => {
  it('creates, selects, duplicates and deletes objects', () => {
    const store = new EditorStore();
    const stroke = pen();
    store.addObject(stroke, { select: true });
    expect(store.page.objects).toHaveLength(1);
    expect(store.selection).toEqual([stroke.id]);

    store.duplicateSelection();
    expect(store.page.objects).toHaveLength(2);
    expect(store.selection).not.toEqual([stroke.id]);

    store.deleteSelection();
    expect(store.page.objects).toHaveLength(1);
  });

  it('copies and pastes with new ids', () => {
    const store = new EditorStore();
    store.addObject(shape(), { select: true });
    store.copySelection();
    store.pasteClipboard({ x: 500, y: 500 });
    expect(store.page.objects).toHaveLength(2);
    const [first, second] = store.page.objects;
    expect(first.id).not.toBe(second.id);
    expect(second.type === 'shape' && second.frame.x).toBeCloseTo(450);
  });

  it('keeps a connector attached when its shape moves', () => {
    const store = new EditorStore();
    const box = shape({ frame: { x: 0, y: 0, w: 100, h: 100 } });
    const connector = line({
      a: { x: 400, y: 50 },
      endBinding: { objectId: box.id, anchor: 'left' },
    });
    store.addObject(box);
    store.addObject(connector);

    store.updateObject(translateObject(box, 200, 0));
    const moved = store.objectById(box.id)!;
    const end = resolveEndpoint(
      store.objectById(connector.id) as never,
      'end',
      (id) => store.objectById(id),
    );
    expect(moved.type === 'shape' && moved.frame.x).toBe(200);
    expect(end.x).toBeCloseTo(200);
  });
});

describe('resize handles', () => {
  it('drives both axes from a corner handle', () => {
    const start = { x: 0, y: 0, w: 100, h: 100 };
    const next = resizeBoundsForTest(start, 'se', { x: 150, y: 120 });
    expect(next).toMatchObject({ x: 0, y: 0, w: 150, h: 120 });
  });

  it('drives only its own axis from an edge handle', () => {
    const start = { x: 0, y: 0, w: 100, h: 100 };
    const east = resizeBoundsForTest(start, 'e', { x: 180, y: 999 });
    expect(east).toMatchObject({ x: 0, y: 0, w: 180, h: 100 });

    const north = resizeBoundsForTest(start, 'n', { x: 999, y: -20 });
    expect(north).toMatchObject({ x: 0, y: -20, w: 100, h: 120 });
  });
});

describe('tool switching', () => {
  it('clears the selection when leaving the Select tool', () => {
    const store = new EditorStore();
    store.setTool('select');
    store.addObject(shape(), { select: true });
    expect(store.selection).toHaveLength(1);
    store.setTool('hand');
    expect(store.selection).toHaveLength(0);
  });
});
