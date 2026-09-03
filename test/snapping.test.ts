import { describe, expect, it } from 'vitest';
import { findSnap } from '../src/canvas/snapping/connectors';
import { anchorPoint } from '../src/document/model/objects';
import { line, pen, shape } from './factories';

const box = shape({ frame: { x: 0, y: 0, w: 100, h: 100 } });

describe('connector snapping', () => {
  it('snaps to the nearest edge anchor when the pointer is close', () => {
    const near = { x: 52, y: 4 };
    const snap = findSnap([box], near, 20);
    expect(snap).toMatchObject({ objectId: box.id, anchor: 'top' });
    expect(snap!.point).toEqual(anchorPoint(box, 'top'));
  });

  it('releases the snap once the pointer moves away', () => {
    expect(findSnap([box], { x: 50, y: -60 }, 20)).toBeNull();
  });

  it('binds to the shape centre when dropped well inside it', () => {
    expect(findSnap([box], { x: 50, y: 50 }, 20)).toMatchObject({ anchor: 'center' });
  });

  it('never snaps to a line or a pen stroke', () => {
    expect(findSnap([line(), pen()], { x: 0, y: 0 }, 40)).toBeNull();
  });

  it('excludes the line being drawn from its own snap targets', () => {
    const self = shape({ frame: { x: 0, y: 0, w: 100, h: 100 } });
    expect(findSnap([self], { x: 50, y: 2 }, 20, self.id)).toBeNull();
  });

  it('prefers the topmost shape when two overlap', () => {
    const under = shape({ frame: { x: 0, y: 0, w: 100, h: 100 } });
    const over = shape({ frame: { x: 0, y: 0, w: 100, h: 100 } });
    expect(findSnap([under, over], { x: 50, y: 2 }, 20)?.objectId).toBe(over.id);
  });
});
