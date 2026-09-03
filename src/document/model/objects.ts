import {
  boundsOfPoints,
  dist,
  distToSegment,
  expandRect,
  rectCenter,
  rectContains,
  rectEdgePointToward,
  rotatePoint,
  unionRects,
} from '../../geometry';
import { textBlockHeight, wrapText, type FontSpec } from '../../canvas/text';
import type {
  ConnectorAnchor,
  DrawingObject,
  LineObject,
  Point,
  Rect,
  ShapeObject,
  TextObject,
} from './types';

export function fontSpecOf(o: TextObject): FontSpec {
  return { family: o.fontFamily, size: o.fontSize, weight: o.fontWeight, italic: o.italic };
}

export function textLines(o: TextObject): string[] {
  return wrapText(o.text, fontSpecOf(o), o.width);
}

export function textBounds(o: TextObject): Rect {
  const lines = textLines(o);
  return { x: o.at.x, y: o.at.y, w: o.width, h: textBlockHeight(lines.length, o.fontSize) };
}

/** Axis-aligned world bounds, accounting for rotation and stroke width. */
export function objectBounds(o: DrawingObject): Rect {
  switch (o.type) {
    case 'pen':
      return expandRect(boundsOfPoints(o.points), o.size / 2);
    case 'line':
      return expandRect(boundsOfPoints([o.a, o.b]), o.size / 2 + 6);
    case 'text':
      return textBounds(o);
    case 'shape': {
      const half = o.size / 2;
      if (o.rotation === 0) return expandRect(o.frame, half);
      return expandRect(boundsOfPoints(shapeCorners(o)), half);
    }
  }
}

export function boundsOfObjects(objects: DrawingObject[]): Rect | null {
  return unionRects(objects.map(objectBounds));
}

export function shapeCorners(o: ShapeObject): Point[] {
  const { x, y, w, h } = o.frame;
  const c = rectCenter(o.frame);
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ].map((p) => rotatePoint(p, c, o.rotation));
}

/** Maps a world point into a shape's unrotated local frame. */
export function toShapeLocal(o: ShapeObject, p: Point): Point {
  return rotatePoint(p, rectCenter(o.frame), -o.rotation);
}

/* ------------------------------------------------------------- anchors --- */

export const ANCHORS: ConnectorAnchor[] = ['top', 'right', 'bottom', 'left'];

export function anchorPoint(o: ShapeObject, anchor: ConnectorAnchor): Point {
  const { x, y, w, h } = o.frame;
  const c = rectCenter(o.frame);
  const local: Point =
    anchor === 'top'
      ? { x: c.x, y }
      : anchor === 'bottom'
        ? { x: c.x, y: y + h }
        : anchor === 'left'
          ? { x, y: c.y }
          : anchor === 'right'
            ? { x: x + w, y: c.y }
            : c;
  return rotatePoint(local, c, o.rotation);
}

/**
 * Resolves a connector endpoint. A bound endpoint follows its shape; when bound
 * to `center` it lands on the edge facing the other end, so the line always
 * stops cleanly at the shape rather than crossing it.
 */
export function resolveEndpoint(
  line: LineObject,
  which: 'start' | 'end',
  lookup: (id: string) => DrawingObject | undefined,
): Point {
  const binding = which === 'start' ? line.startBinding : line.endBinding;
  const fallback = which === 'start' ? line.a : line.b;
  if (!binding) return fallback;
  const target = lookup(binding.objectId);
  if (!target || target.type !== 'shape') return fallback;
  if (binding.anchor !== 'center') return anchorPoint(target, binding.anchor);
  const other = which === 'start' ? line.b : line.a;
  return rectEdgePointToward(target.frame, other);
}

/* ---------------------------------------------------------- hit testing --- */

/**
 * `tolerance` is in world units and is derived from the pointer type, so a
 * finger gets a forgiving target without making mouse selection sloppy.
 */
export function hitTest(o: DrawingObject, p: Point, tolerance: number): boolean {
  switch (o.type) {
    case 'pen': {
      const reach = o.size / 2 + tolerance;
      if (!rectContains(expandRect(boundsOfPoints(o.points), reach), p)) return false;
      if (o.points.length === 1) return dist(p, o.points[0]) <= reach;
      for (let i = 1; i < o.points.length; i++) {
        if (distToSegment(p, o.points[i - 1], o.points[i]) <= reach) return true;
      }
      return false;
    }
    case 'line':
      return distToSegment(p, o.a, o.b) <= o.size / 2 + tolerance;
    case 'text':
      return rectContains(expandRect(textBounds(o), tolerance), p);
    case 'shape': {
      const local = toShapeLocal(o, p);
      const outer = expandRect(o.frame, tolerance + o.size / 2);
      if (!rectContains(outer, local)) return false;
      // A filled shape is solid to the touch; an unfilled one is hit on its edge
      // or on its label, so a labelled outline stays easy to tap.
      if (o.fill !== null || o.text.trim() !== '') return true;
      const inner = expandRect(o.frame, -(tolerance + o.size / 2));
      return !(inner.w > 0 && inner.h > 0 && rectContains(inner, local));
    }
  }
}

/** Topmost object under the point, or null. Objects are searched front to back. */
export function pickObject(
  objects: DrawingObject[],
  p: Point,
  tolerance: number,
): DrawingObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (hitTest(objects[i], p, tolerance)) return objects[i];
  }
  return null;
}

/* ----------------------------------------------------------- transforms --- */

export function translateObject(o: DrawingObject, dx: number, dy: number): DrawingObject {
  switch (o.type) {
    case 'pen':
      return { ...o, points: o.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })) };
    case 'line':
      return {
        ...o,
        a: { x: o.a.x + dx, y: o.a.y + dy },
        b: { x: o.b.x + dx, y: o.b.y + dy },
      };
    case 'text':
      return { ...o, at: { x: o.at.x + dx, y: o.at.y + dy } };
    case 'shape':
      return { ...o, frame: { ...o.frame, x: o.frame.x + dx, y: o.frame.y + dy } };
  }
}

/** Scales an object from `from` bounds into `to` bounds. Used by resize handles. */
export function scaleObjectInto(o: DrawingObject, from: Rect, to: Rect): DrawingObject {
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  const map = (p: Point): Point => ({
    x: to.x + (p.x - from.x) * sx,
    y: to.y + (p.y - from.y) * sy,
  });
  const uniform = Math.sqrt(Math.abs(sx * sy));
  switch (o.type) {
    case 'pen':
      return {
        ...o,
        points: o.points.map((pt) => ({ ...map(pt), p: pt.p })),
        size: Math.max(0.5, o.size * uniform),
      };
    case 'line':
      return { ...o, a: map(o.a), b: map(o.b) };
    case 'text':
      return { ...o, at: map(o.at), width: Math.max(24, o.width * sx), fontSize: Math.max(6, o.fontSize * uniform) };
    case 'shape': {
      const tl = map({ x: o.frame.x, y: o.frame.y });
      return {
        ...o,
        frame: { x: tl.x, y: tl.y, w: Math.max(4, o.frame.w * sx), h: Math.max(4, o.frame.h * sy) },
      };
    }
  }
}
