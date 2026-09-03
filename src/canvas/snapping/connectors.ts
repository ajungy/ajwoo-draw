import { ANCHORS, anchorPoint } from '../../document/model/objects';
import { dist, rectContains, rectCenter } from '../../geometry';
import type {
  ConnectorAnchor,
  DrawingObject,
  Point,
  ShapeObject,
} from '../../document/model/types';

export interface SnapResult {
  objectId: string;
  anchor: ConnectorAnchor;
  point: Point;
}

/** Snap radius in screen pixels, converted to world units by the caller. */
export const SNAP_RADIUS_PX = 28;

/**
 * Finds the connection point a free endpoint should attach to.
 *
 * Named edge anchors win when the pointer is near one. Dropping well inside a
 * shape binds to `center`, which resolves to whichever edge faces the other end
 * — that is what keeps a connector sensible after the shape is moved.
 * Returning null means "stay free", so releasing a snap is just moving away.
 */
export function findSnap(
  objects: DrawingObject[],
  p: Point,
  radius: number,
  exclude?: string,
): SnapResult | null {
  let best: SnapResult | null = null;
  let bestDist = radius;

  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type !== 'shape' || o.id === exclude) continue;
    for (const anchor of ANCHORS) {
      const point = anchorPoint(o as ShapeObject, anchor);
      const d = dist(p, point);
      if (d < bestDist) {
        bestDist = d;
        best = { objectId: o.id, anchor, point };
      }
    }
  }
  if (best) return best;

  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type !== 'shape' || o.id === exclude) continue;
    if (rectContains(o.frame, p)) {
      return { objectId: o.id, anchor: 'center', point: rectCenter(o.frame) };
    }
  }
  return null;
}
