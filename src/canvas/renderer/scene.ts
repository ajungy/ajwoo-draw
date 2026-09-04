import { ANCHORS, anchorPoint, objectBounds } from '../../document/model/objects';
import { rectCenter, rectsIntersect, rotatePoint, worldToScreen } from '../../geometry';
import type { Camera, DrawingObject, Point, Rect, ShapeObject } from '../../document/model/types';
import type { EphemeralState } from '../../app/store';
import { drawObject, type Lookup } from './drawObject';

export interface SceneInput {
  objects: DrawingObject[];
  camera: Camera;
  /** CSS pixel size of the canvas. */
  width: number;
  height: number;
  dpr: number;
  selection: Set<string>;
  ephemeral: EphemeralState;
  showGrid: boolean;
  /** Resolved design-system colours; the canvas cannot read CSS variables. */
  theme: SceneTheme;
  /** Selection chrome is hidden during export and while text is being edited. */
  showOverlay: boolean;
  /** The object whose label/text is being edited right now, hidden here because
   *  the HTML text overlay is already showing it — drawing it twice reads as a
   *  ghosting/double-vision glitch. */
  editingId?: string | null;
  /** Whole-canvas hand-drawn rendering mode — see drawObject.ts. */
  scrappy?: boolean;
}

export interface SceneTheme {
  page: string;
  grid: string;
  accent: string;
  accentSoft: string;
  handleFill: string;
}

const GRID_SPACING = 32;
export const HANDLE_SIZE = 10;
/** Screen-space distance from the top edge to the rotate handle. */
const ROTATE_HANDLE_OFFSET = 28;

export function renderScene(ctx: CanvasRenderingContext2D, input: SceneInput): void {
  const { camera, width, height, dpr } = input;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = input.theme.page;
  ctx.fillRect(0, 0, width, height);

  if (input.showGrid) drawGrid(ctx, input);

  const viewport: Rect = {
    x: camera.x,
    y: camera.y,
    w: width / camera.zoom,
    h: height / camera.zoom,
  };

  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  const lookup: Lookup = (id) => input.objects.find((o) => o.id === id);
  const editingId = input.editingId ?? null;
  const scrappy = input.scrappy ?? false;
  // Culling keeps a large document cheap: only what intersects the viewport is
  // handed to the 2D context at all.
  for (const o of input.objects) {
    if (rectsIntersect(objectBounds(o), viewport)) drawObject(ctx, o, lookup, editingId, scrappy);
  }
  if (input.ephemeral.draft) drawObject(ctx, input.ephemeral.draft, lookup, editingId, scrappy, true);
  ctx.restore();

  if (input.showOverlay) drawOverlay(ctx, input);
}

/** A dotted grid reads as texture rather than ruled paper — square-spaced,
 *  quiet, and it never competes with drawn strokes the way ruled lines do. */
function drawGrid(ctx: CanvasRenderingContext2D, input: SceneInput): void {
  const { camera, width, height } = input;
  const step = GRID_SPACING * camera.zoom;
  if (step < 8) return;
  const offsetX = -((camera.x * camera.zoom) % step);
  const offsetY = -((camera.y * camera.zoom) % step);
  const radius = Math.min(1.4, Math.max(0.6, camera.zoom));
  ctx.fillStyle = input.theme.grid;
  for (let x = offsetX; x < width + step; x += step) {
    for (let y = offsetY; y < height + step; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Selection chrome is drawn in screen space, so handles stay a constant, easily
 * tappable size at every zoom level.
 */
function drawOverlay(ctx: CanvasRenderingContext2D, input: SceneInput): void {
  const { camera, selection, ephemeral, theme } = input;
  const toScreenRect = (r: Rect): Rect => {
    const tl = worldToScreen(camera, { x: r.x, y: r.y });
    return { x: tl.x, y: tl.y, w: r.w * camera.zoom, h: r.h * camera.zoom };
  };

  // The shape a connector would attach to is outlined, so a valid target is
  // visible before the finger lifts — not only after the line has bound to it.
  if (ephemeral.snapObjectId) {
    const target = input.objects.find((o) => o.id === ephemeral.snapObjectId);
    if (target) {
      const r = toScreenRect(objectBounds(target));
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(r.x) - 1, Math.round(r.y) - 1, Math.round(r.w) + 2, Math.round(r.h) + 2);

      // Every named anchor the endpoint could bind to, not only the one it's
      // currently closest to — so it's obvious where else on the shape a
      // connector can land before the pointer gets there.
      if (target.type === 'shape') {
        for (const anchor of ANCHORS) {
          const ap = worldToScreen(camera, anchorPoint(target, anchor));
          const isActive =
            ephemeral.snapPoint && ap.x === worldToScreen(camera, ephemeral.snapPoint).x &&
            ap.y === worldToScreen(camera, ephemeral.snapPoint).y;
          ctx.fillStyle = theme.handleFill;
          ctx.strokeStyle = theme.accent;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ap.x, ap.y, isActive ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  if (ephemeral.snapPoint) {
    const p = worldToScreen(camera, ephemeral.snapPoint);
    ctx.fillStyle = theme.accentSoft;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const selected = input.objects.filter((o) => selection.has(o.id));
  if (selected.length > 0) {
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1;
    for (const o of selected) {
      const r = toScreenRect(objectBounds(o));
      ctx.strokeRect(Math.round(r.x) - 0.5, Math.round(r.y) - 0.5, Math.round(r.w) + 1, Math.round(r.h) + 1);
    }

    // A single shape gets an oriented box that rotates with it — handles and
    // all — which is what makes rotating and then resizing it feel coherent,
    // the way it does in Figma. Everything else (multi-select, lines, pen
    // strokes, text) keeps the simpler axis-aligned box.
    if (selected.length === 1 && selected[0].type === 'shape') {
      drawOrientedHandles(ctx, selected[0], camera, theme);
    } else {
      const box = unionScreenRects(selected.map((o) => toScreenRect(objectBounds(o))));
      if (box) drawHandles(ctx, handleRects(box), theme);
    }
  }

  if (ephemeral.marquee) {
    const r = toScreenRect(ephemeral.marquee);
    ctx.fillStyle = theme.accentSoft;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(r.x) - 0.5, Math.round(r.y) - 0.5, Math.round(r.w) + 1, Math.round(r.h) + 1);
  }
}

function unionScreenRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export type HandleId = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

/** Axis-aligned handle positions — the multi-select / non-shape case. */
export function handleRects(box: Rect): Record<HandleId, Rect> {
  const h = HANDLE_SIZE;
  const half = h / 2;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    nw: { x: box.x - half, y: box.y - half, w: h, h },
    ne: { x: box.x + box.w - half, y: box.y - half, w: h, h },
    se: { x: box.x + box.w - half, y: box.y + box.h - half, w: h, h },
    sw: { x: box.x - half, y: box.y + box.h - half, w: h, h },
    n: { x: cx - half, y: box.y - half, w: h, h },
    s: { x: cx - half, y: box.y + box.h - half, w: h, h },
    e: { x: box.x + box.w - half, y: cy - half, w: h, h },
    w: { x: box.x - half, y: cy - half, w: h, h },
  };
}

function drawHandles(ctx: CanvasRenderingContext2D, rects: Record<HandleId, Rect>, theme: SceneTheme): void {
  ctx.fillStyle = theme.handleFill;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1.5;
  for (const r of Object.values(rects)) {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** Local (unrotated, object-space) offsets for each handle, as a fraction of half-width/height. */
const HANDLE_LOCAL: Record<HandleId, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

/**
 * Screen-space position of every handle on a (possibly rotated) shape's
 * bounding box, plus the rotate handle floating above it. Shared between the
 * renderer (drawing) and the controller (hit-testing), so the two can never
 * disagree about where a handle actually is.
 */
export function orientedHandlePoints(
  shape: ShapeObject,
  camera: Camera,
): { handles: Record<HandleId, Point>; rotate: Point; center: Point } {
  const centerWorld = rectCenter(shape.frame);
  const hw = shape.frame.w / 2;
  const hh = shape.frame.h / 2;
  const toScreen = (local: [number, number]): Point => {
    const worldPt = rotatePoint(
      { x: centerWorld.x + local[0] * hw, y: centerWorld.y + local[1] * hh },
      centerWorld,
      shape.rotation,
    );
    return worldToScreen(camera, worldPt);
  };
  const handles = Object.fromEntries(
    (Object.entries(HANDLE_LOCAL) as [HandleId, [number, number]][]).map(([id, local]) => [
      id,
      toScreen(local),
    ]),
  ) as Record<HandleId, Point>;

  // The rotate handle sits a fixed screen distance above the shape's own top
  // edge, along the shape's own rotated "up" direction — so it stays sensibly
  // placed relative to the shape no matter how it is turned.
  const topMid = toScreen([0, -1]);
  const center = worldToScreen(camera, centerWorld);
  const dx = topMid.x - center.x;
  const dy = topMid.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  const rotate: Point = {
    x: topMid.x + (dx / len) * ROTATE_HANDLE_OFFSET,
    y: topMid.y + (dy / len) * ROTATE_HANDLE_OFFSET,
  };
  return { handles, rotate, center };
}

function drawOrientedHandles(
  ctx: CanvasRenderingContext2D,
  shape: ShapeObject,
  camera: Camera,
  theme: SceneTheme,
): void {
  const { handles, rotate } = orientedHandlePoints(shape, camera);

  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(handles.n.x, handles.n.y);
  ctx.lineTo(rotate.x, rotate.y);
  ctx.stroke();

  ctx.fillStyle = theme.handleFill;
  ctx.beginPath();
  ctx.arc(rotate.x, rotate.y, HANDLE_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const half = HANDLE_SIZE / 2;
  ctx.fillStyle = theme.handleFill;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1.5;
  for (const p of Object.values(handles)) {
    ctx.beginPath();
    ctx.roundRect(p.x - half, p.y - half, HANDLE_SIZE, HANDLE_SIZE, 2);
    ctx.fill();
    ctx.stroke();
  }
}
