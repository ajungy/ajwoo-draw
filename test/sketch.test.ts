import { describe, expect, it } from 'vitest';
import { jitterStrokePoints, seedFromId, sketchPolyline, sketchVertices } from '../src/canvas/sketch';

describe('scrappy mode geometry', () => {
  it('seeds deterministically from an id', () => {
    expect(seedFromId('abc123')).toBe(seedFromId('abc123'));
    expect(seedFromId('abc123')).not.toBe(seedFromId('abc124'));
  });

  it('produces the exact same wobble for the same object twice', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const seed = seedFromId('some-shape-id');
    const a = sketchPolyline(pts, seed, 4, true);
    const b = sketchPolyline(pts, seed, 4, true);
    expect(a).toBe(b);
  });

  it('gives different shapes visibly different wobbles', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const a = sketchPolyline(pts, seedFromId('shape-a'), 4, true);
    const b = sketchPolyline(pts, seedFromId('shape-b'), 4, true);
    expect(a).not.toBe(b);
  });

  it('stays reasonably close to the true edge (a subtle wobble, not noise)', () => {
    const d = sketchPolyline([{ x: 0, y: 0 }, { x: 200, y: 0 }], seedFromId('line-1'), 4, false);
    const coords = [...d.matchAll(/-?\d+\.?\d*/g)].map(Number);
    // Every y-coordinate in the curve should stay within a few px of the
    // straight line at y=0 — this is meant to read as hand-drawn, not chaotic.
    const ys = coords.filter((_, i) => i % 2 === 1);
    for (const y of ys) expect(Math.abs(y)).toBeLessThan(6);
  });

  it('produces a closed vertex loop for every shape kind', () => {
    const frame = { x: 0, y: 0, w: 100, h: 60 };
    for (const kind of ['rectangle', 'ellipse', 'triangle', 'star', 'arrow', 'heart', 'note'] as const) {
      const verts = sketchVertices(kind, frame);
      expect(verts.length).toBeGreaterThanOrEqual(3);
      for (const p of verts) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });

  it('jitters pen points without moving them far, and is deterministic per object', () => {
    const points = [{ x: 0, y: 0, p: 0.5 }, { x: 10, y: 10, p: 0.5 }, { x: 20, y: 0, p: 0.5 }];
    const seed = seedFromId('pen-1');
    const a = jitterStrokePoints(points, seed, 4);
    const b = jitterStrokePoints(points, seed, 4);
    expect(a).toEqual(b);
    for (let i = 0; i < points.length; i++) {
      expect(Math.hypot(a[i].x - points[i].x, a[i].y - points[i].y)).toBeLessThan(3);
    }
  });
});
