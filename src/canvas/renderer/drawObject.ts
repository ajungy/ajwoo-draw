import { labelInset, shapePathData } from '../shapes';
import { jitterStrokePoints, lineWobbleAmplitude, seedFromId, shapeWobbleAmplitude, sketchPolyline, sketchVertices } from '../sketch';
import { cssFont, LINE_HEIGHT, wrapText, type FontSpec } from '../text';
import { fontSpecOf, resolveEndpoint, textLines } from '../../document/model/objects';
import { rectCenter } from '../../geometry';
import type { DrawingObject, LineObject, Point, ShapeObject, TextObject } from '../../document/model/types';
import { penOutlinePath } from './strokes';

export type Lookup = (id: string) => DrawingObject | undefined;

/** One cached Path2D per (object, variant) — "variant" separates the clean
 *  outline from the scrappy one, so toggling Scrappy doesn't have to fight a
 *  cache built for the other mode. Objects are immutable, so both variants
 *  stay valid for the object's whole lifetime once built. */
const pathCache = new WeakMap<DrawingObject, Map<string, Path2D>>();

function cachedPath(o: DrawingObject, variant: string, build: () => string): Path2D {
  let variants = pathCache.get(o);
  if (!variants) {
    variants = new Map();
    pathCache.set(o, variants);
  }
  const hit = variants.get(variant);
  if (hit) return hit;
  const path = new Path2D(build());
  variants.set(variant, path);
  return path;
}

export function dashPattern(style: LineObject['style'], size: number): number[] {
  if (style === 'dashed') return [size * 3, size * 2];
  if (style === 'dotted') return [0.1, size * 2];
  return [];
}

/**
 * `editingId` suppresses drawing the text of the one object currently open in
 * the HTML text-editor overlay — that text is already on screen in the
 * textarea, and drawing it here too reads as a doubled, slightly-offset ghost
 * of every letter.
 *
 * `scrappy` is a whole-canvas rendering mode, not a document property: every
 * straight edge wobbles like a pencil line and text switches to a handwritten
 * face, but nothing about the stored object changes.
 *
 * `isDraft` marks the one object currently being drawn or resized, before it
 * is committed. The path cache assumes an object's geometry never changes
 * once built — true for every committed object, false for the draft, which
 * the interaction layer mutates in place on every pointer move. Caching its
 * path would freeze the very first frame's (near-empty) outline for the rest
 * of the gesture, which is exactly why a stroke used to stay invisible until
 * the pointer lifted. The draft rebuilds its path every frame instead — one
 * object, so the cost is negligible.
 */
export function drawObject(
  ctx: CanvasRenderingContext2D,
  o: DrawingObject,
  lookup: Lookup,
  editingId: string | null = null,
  scrappy = false,
  isDraft = false,
): void {
  const isEditing = o.id === editingId;
  switch (o.type) {
    case 'pen':
      drawPen(ctx, o, scrappy, isDraft);
      break;
    case 'shape':
      drawShape(ctx, o, isEditing, scrappy, isDraft);
      break;
    case 'line':
      drawLine(ctx, o, lookup, scrappy);
      break;
    case 'text':
      if (!isEditing) drawText(ctx, o, scrappy);
      break;
  }
}

function drawPen(ctx: CanvasRenderingContext2D, o: DrawingObject & { type: 'pen' }, scrappy: boolean, isDraft: boolean): void {
  if (o.points.length === 0) return;
  ctx.fillStyle = o.color;
  const build = () => {
    if (!scrappy) return penOutlinePath(o);
    const jittered = jitterStrokePoints(o.points, seedFromId(o.id), o.size);
    return penOutlinePath({ ...o, points: jittered });
  };
  const path = isDraft ? new Path2D(build()) : cachedPath(o, scrappy ? 'sketch' : 'clean', build);
  ctx.fill(path, 'nonzero');
}

function drawShape(ctx: CanvasRenderingContext2D, o: ShapeObject, skipLabel: boolean, scrappy: boolean, isDraft: boolean): void {
  const c = rectCenter(o.frame);
  ctx.save();
  if (o.rotation !== 0) {
    ctx.translate(c.x, c.y);
    ctx.rotate(o.rotation);
    ctx.translate(-c.x, -c.y);
  }
  const buildFill = () => shapePathData(o.kind, o.frame);
  const fillPath = isDraft ? new Path2D(buildFill()) : cachedPath(o, 'clean', buildFill);
  if (o.fill) {
    ctx.fillStyle = o.fill;
    ctx.fill(fillPath);
  }
  if (o.size > 0 && o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.size;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (scrappy) {
      const buildSketch = () =>
        sketchPolyline(
          sketchVertices(o.kind, o.frame),
          seedFromId(o.id),
          shapeWobbleAmplitude(o.frame.w, o.frame.h),
          true,
        );
      const sketchPath = isDraft ? new Path2D(buildSketch()) : cachedPath(o, 'sketch', buildSketch);
      ctx.stroke(sketchPath);
    } else {
      ctx.stroke(fillPath);
    }
  }
  if (!skipLabel && o.text.trim() !== '') drawShapeLabel(ctx, o, scrappy);
  ctx.restore();
}

function drawShapeLabel(ctx: CanvasRenderingContext2D, o: ShapeObject, scrappy: boolean): void {
  const inset = labelInset(o.kind);
  const maxWidth = Math.max(16, o.frame.w * (1 - inset.x * 2));
  const font: FontSpec = { family: scrappy ? 'hand' : 'sans', size: o.fontSize, weight: 500, italic: false };
  const lines = wrapText(o.text, font, maxWidth);
  const c = rectCenter(o.frame);
  ctx.font = cssFont(font);
  ctx.fillStyle = o.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineH = o.fontSize * LINE_HEIGHT;
  const top = c.y - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, c.x, top + i * lineH));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function lineEndpoints(o: LineObject, lookup: Lookup): [Point, Point] {
  return [resolveEndpoint(o, 'start', lookup), resolveEndpoint(o, 'end', lookup)];
}

/**
 * Arrow head geometry, shared with the SVG exporter. The triangle's own tip is
 * the true endpoint; the line body must stop at the triangle's *base*, not run
 * all the way to the tip underneath it — otherwise the flat-capped stroke
 * pokes past (or shows through) the point and the arrow reads as blunt.
 */
export function arrowHeadPoints(from: Point, to: Point, size: number): [Point, Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const len = arrowLength(size);
  const spread = 0.42;
  return [
    to,
    { x: to.x - Math.cos(angle - spread) * len, y: to.y - Math.sin(angle - spread) * len },
    { x: to.x - Math.cos(angle + spread) * len, y: to.y - Math.sin(angle + spread) * len },
  ];
}

export function arrowLength(size: number): number {
  return Math.max(8, size * 3.2);
}

/** The point along the from→to axis where the line body should stop, at the
 *  arrowhead's own midpoint rather than its tip. */
export function arrowBaseCenter(from: Point, to: Point, size: number): Point {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const back = arrowLength(size) * 0.5;
  return { x: to.x - Math.cos(angle) * back, y: to.y - Math.sin(angle) * back };
}

function drawLine(ctx: CanvasRenderingContext2D, o: LineObject, lookup: Lookup, scrappy: boolean): void {
  const [a, b] = lineEndpoints(o, lookup);
  const lineStart = o.startArrow === 'arrow' ? arrowBaseCenter(b, a, o.size) : a;
  const lineEnd = o.endArrow === 'arrow' ? arrowBaseCenter(a, b, o.size) : b;

  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = o.size;
  ctx.setLineDash(dashPattern(o.style, o.size));

  if (scrappy) {
    // The shaft wobbles; the arrowhead (drawn below, from the true endpoints)
    // stays crisp, so the direction it points is never in doubt.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const seed = seedFromId(o.id);
    const amplitude = lineWobbleAmplitude(Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y));
    ctx.stroke(new Path2D(sketchPolyline([lineStart, lineEnd], seed, amplitude, false)));
  } else {
    ctx.lineCap = o.style === 'dotted' ? 'round' : 'butt';
    ctx.beginPath();
    ctx.moveTo(lineStart.x, lineStart.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  // Arrow heads are filled from the true endpoints, so the point itself is
  // exactly where the line was aimed, unaffected by the body's cutback.
  if (o.endArrow === 'arrow') fillArrowHead(ctx, a, b, o.size);
  if (o.startArrow === 'arrow') fillArrowHead(ctx, b, a, o.size);
}

function fillArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number): void {
  const [tip, l, r] = arrowHeadPoints(from, to, size);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(l.x, l.y);
  ctx.lineTo(r.x, r.y);
  ctx.closePath();
  ctx.fill();
}

function drawText(ctx: CanvasRenderingContext2D, o: TextObject, scrappy: boolean): void {
  const spec: FontSpec = scrappy ? { ...fontSpecOf(o), family: 'hand' } : fontSpecOf(o);
  const lines = scrappy ? wrapText(o.text, spec, o.width) : textLines(o);
  ctx.font = cssFont(spec);
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align === 'center' ? 'center' : o.align === 'right' ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  const anchorX = o.align === 'center' ? o.at.x + o.width / 2 : o.align === 'right' ? o.at.x + o.width : o.at.x;
  const lineH = o.fontSize * LINE_HEIGHT;
  lines.forEach((line, i) => {
    const baseline = o.at.y + lineH * i + o.fontSize;
    ctx.fillText(line, anchorX, baseline);
    if (o.underline && line !== '') {
      const w = ctx.measureText(line).width;
      const startX = o.align === 'center' ? anchorX - w / 2 : o.align === 'right' ? anchorX - w : anchorX;
      ctx.fillRect(startX, baseline + o.fontSize * 0.12, w, Math.max(1, o.fontSize / 16));
    }
  });
  ctx.textAlign = 'left';
}
