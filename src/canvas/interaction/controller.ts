import type { EditorStore } from '../../app/store';
import { deleteObjects, nextZ } from '../../document/model/document';
import { newId } from '../../document/model/ids';
import {
  boundsOfObjects,
  objectBounds,
  pickObject,
  scaleObjectInto,
  toShapeLocal,
  translateObject,
} from '../../document/model/objects';
import {
  clamp,
  dist,
  expandRect,
  rectCenter,
  rectContains,
  rectFromPoints,
  rectsIntersect,
  screenToWorld,
  worldToScreen,
  zoomAbout,
} from '../../geometry';
import { MAX_ZOOM, MIN_ZOOM } from '../../document/model/types';
import type {
  DrawingObject,
  LineObject,
  Point,
  Rect,
  ShapeObject,
  TextObject,
} from '../../document/model/types';
import { findSnap, SNAP_RADIUS_PX } from '../snapping/connectors';
import { handleRects, orientedHandlePoints, type HandleId } from '../renderer/scene';
import { cursorForHandle, ROTATE_CURSOR } from '../cursors';

/** Movement (in screen px) below which a pointer sequence counts as a tap. */
const TAP_SLOP = 8;
const TOUCH_PICK_TOLERANCE_PX = 12;
const MOUSE_PICK_TOLERANCE_PX = 5;
const HANDLE_HIT_RADIUS_PX = 16;
const DEFAULT_SHAPE_SIZE = 120;
const DEFAULT_TEXT_WIDTH = 240;

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; last: Point }
  | { kind: 'pinch' }
  | { kind: 'pen'; object: DrawingObject & { type: 'pen' } }
  | { kind: 'line'; object: LineObject }
  | { kind: 'shape'; origin: Point; object: ShapeObject }
  | {
      kind: 'move';
      last: Point;
      originals: DrawingObject[];
      moved: boolean;
      committed: boolean;
      /** Whether the target was already the (sole, non-shift) selection when
       *  this gesture began — a tap that only just selected something should
       *  leave its handles visible, not jump straight into editing it before
       *  the person has even seen them. */
      wasSelected: boolean;
    }
  | {
      kind: 'resize';
      handle: HandleId;
      startBounds: Rect;
      originals: DrawingObject[];
      /** Set only when resizing a single shape — resize then happens in its
       *  own (possibly rotated) local space rather than world axes. */
      localShape: ShapeObject | null;
      committed: boolean;
    }
  | { kind: 'rotate'; shapeId: string; center: Point; startAngle: number; startRotation: number; committed: boolean }
  | { kind: 'marquee'; origin: Point }
  | { kind: 'endpoint'; line: LineObject; which: 'a' | 'b' }
  | { kind: 'erase'; removed: Set<string> };

type HandleHit = { kind: 'resize'; handle: HandleId } | { kind: 'rotate' };

export interface ControllerHost {
  store: EditorStore;
  /** Asks the app to open the text editor overlay for an object. */
  requestTextEdit: (id: string) => void;
  /** Imperative cursor updates — kept out of the store so hovering never
   *  triggers a React render, only a style write on the canvas element. */
  onCursor?: (cursor: string) => void;
}

export class CanvasController {
  private gesture: Gesture = { kind: 'none' };
  private pointers = new Map<number, Point>();
  private pinchStart: { dist: number; zoom: number; mid: Point; camera: Point } | null = null;
  private downAt: Point | null = null;
  private downTarget: DrawingObject | null = null;
  private moved = false;
  private spaceHeld = false;

  constructor(private host: ControllerHost) {}

  private get store(): EditorStore {
    return this.host.store;
  }

  setSpaceHeld(held: boolean): void {
    this.spaceHeld = held;
  }

  /* ------------------------------------------------------------ helpers -- */

  private toWorld(screen: Point): Point {
    return screenToWorld(this.store.camera, screen);
  }

  private tolerance(pointerType: string): number {
    const px = pointerType === 'mouse' ? MOUSE_PICK_TOLERANCE_PX : TOUCH_PICK_TOLERANCE_PX;
    return px / this.store.camera.zoom;
  }

  private snapRadius(): number {
    return SNAP_RADIUS_PX / this.store.camera.zoom;
  }

  private selectionScreenBox(): Rect | null {
    const bounds = boundsOfObjects(this.store.selectedObjects());
    if (!bounds) return null;
    const tl = worldToScreen(this.store.camera, { x: bounds.x, y: bounds.y });
    return { x: tl.x, y: tl.y, w: bounds.w * this.store.camera.zoom, h: bounds.h * this.store.camera.zoom };
  }

  /**
   * Finds the resize/rotate handle under a screen point, if any. A single
   * selected shape gets its own oriented handle set (so a rotated shape's
   * handles are hit-tested where they are actually drawn); everything else
   * uses the simpler axis-aligned box.
   */
  private pickHandle(screen: Point): HandleHit | null {
    const store = this.store;
    const selected = store.selectedObjects();
    if (selected.length === 0) return null;

    if (selected.length === 1 && selected[0].type === 'shape') {
      const { handles, rotate } = orientedHandlePoints(selected[0], store.camera);
      if (dist(screen, rotate) < HANDLE_HIT_RADIUS_PX) return { kind: 'rotate' };
      let best: HandleId | null = null;
      let bestD = HANDLE_HIT_RADIUS_PX;
      for (const [id, p] of Object.entries(handles) as [HandleId, Point][]) {
        const d = dist(screen, p);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      return best ? { kind: 'resize', handle: best } : null;
    }

    const box = this.selectionScreenBox();
    if (!box) return null;
    let best: HandleId | null = null;
    let bestD = HANDLE_HIT_RADIUS_PX;
    for (const [id, r] of Object.entries(handleRects(box)) as [HandleId, Rect][]) {
      const d = dist(screen, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best ? { kind: 'resize', handle: best } : null;
  }

  /** Whether a world point falls inside the current selection's own bounds —
   *  a rotated shape is tested against its true rotated footprint, not its
   *  axis-aligned box, so a corner outside the shape but inside the box isn't
   *  mistaken for a hit. This is what lets a click anywhere in a selected
   *  object's hollow interior (or between multi-selected objects) still grab
   *  and move the selection, the way it does in Figma. */
  private pointInSelectionBounds(world: Point): boolean {
    const store = this.store;
    const selected = store.selectedObjects();
    if (selected.length === 0) return false;
    const pad = 4 / store.camera.zoom;
    if (selected.length === 1 && selected[0].type === 'shape') {
      const shape = selected[0];
      return rectContains(expandRect(shape.frame, pad), toShapeLocal(shape, world));
    }
    const bounds = boundsOfObjects(selected);
    return bounds ? rectContains(expandRect(bounds, pad), world) : false;
  }

  private clearEphemeral(): void {
    const e = this.store.ephemeral;
    e.draft = null;
    e.marquee = null;
    e.snapObjectId = null;
    e.snapPoint = null;
  }

  /* ------------------------------------------------------------- cursor -- */

  /** Cursor for the current gesture, or for what's under the pointer while idle. */
  private cursorFor(screen: Point): string {
    const g = this.gesture;
    switch (g.kind) {
      case 'resize':
        return cursorForHandle(g.handle);
      case 'rotate':
        return ROTATE_CURSOR;
      case 'move':
        return 'move';
      case 'pan':
        return 'grabbing';
      default:
        return this.hoverCursor(screen);
    }
  }

  private hoverCursor(screen: Point): string {
    const store = this.store;
    if (store.tool !== 'select') return '';
    const handle = this.pickHandle(screen);
    if (handle) return handle.kind === 'rotate' ? ROTATE_CURSOR : cursorForHandle(handle.handle);

    const world = this.toWorld(screen);
    const selected = store.selectedObjects();
    if (selected.length === 1 && selected[0].type === 'line') {
      const line = selected[0];
      const reach = 14 / store.camera.zoom;
      if (dist(world, line.a) < reach || dist(world, line.b) < reach) return 'crosshair';
    }
    if (this.pointInSelectionBounds(world)) return 'move';
    const target = pickObject(store.page.objects, world, this.tolerance('mouse'));
    return target ? 'move' : '';
  }

  private updateCursor(screen: Point): void {
    this.host.onCursor?.(this.cursorFor(screen));
  }

  /* ------------------------------------------------------------- pointer -- */

  onPointerDown(e: PointerEvent, screen: Point): void {
    this.pointers.set(e.pointerId, screen);

    if (this.pointers.size === 2) {
      this.beginPinch();
      return;
    }
    if (this.pointers.size > 2) return;

    this.downAt = screen;
    this.moved = false;
    const world = this.toWorld(screen);
    const store = this.store;
    const tol = this.tolerance(e.pointerType);
    this.downTarget = pickObject(store.page.objects, world, tol);

    // Middle-drag and space-drag pan from any tool — a desktop convention that
    // costs nothing and saves a trip to the toolbar.
    if (e.button === 1 || this.spaceHeld || store.tool === 'hand') {
      this.gesture = { kind: 'pan', last: screen };
      this.updateCursor(screen);
      return;
    }

    switch (store.tool) {
      case 'pen':
        this.beginPen(world, e.pressure, e.pointerType);
        break;
      case 'eraser':
        this.beginErase(world, e.pointerType);
        break;
      case 'line':
        this.beginLine(world);
        break;
      case 'shape':
        this.beginShape(world);
        break;
      case 'text':
        this.gesture = { kind: 'none' };
        break;
      case 'select':
        this.beginSelectGesture(screen, world, e.shiftKey);
        break;
    }
    this.updateCursor(screen);
  }

  onPointerMove(e: PointerEvent, screen: Point): void {
    if (!this.pointers.has(e.pointerId)) {
      // No button down: this is a hover, not a gesture. The only thing it
      // does is keep the cursor honest about what a click here would do.
      this.updateCursor(screen);
      return;
    }
    this.pointers.set(e.pointerId, screen);

    if (this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }
    if (this.downAt && dist(this.downAt, screen) > TAP_SLOP) this.moved = true;

    const world = this.toWorld(screen);
    const g = this.gesture;

    switch (g.kind) {
      case 'pan': {
        const zoom = this.store.camera.zoom;
        this.store.setCamera({
          ...this.store.camera,
          x: this.store.camera.x - (screen.x - g.last.x) / zoom,
          y: this.store.camera.y - (screen.y - g.last.y) / zoom,
        });
        g.last = screen;
        break;
      }
      case 'pen': {
        // Coalesced events give the full input sample rate on high-refresh
        // screens without one repaint per sample.
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
        for (const ce of events.length > 0 ? events : [e]) {
          const p = this.eventWorld(ce, screen);
          g.object.points.push({ ...p, p: pressureOf(ce.pressure, ce.pointerType) });
        }
        this.store.invalidate();
        break;
      }
      case 'erase': {
        this.eraseAt(world, e.pointerType, g.removed);
        break;
      }
      case 'line': {
        g.object.b = world;
        this.applyLineSnap(g.object, world, 'end');
        this.store.invalidate();
        break;
      }
      case 'shape': {
        const r = rectFromPoints(g.origin, world);
        g.object.frame = { x: r.x, y: r.y, w: Math.max(1, r.w), h: Math.max(1, r.h) };
        this.store.invalidate();
        break;
      }
      case 'move': {
        const dx = world.x - g.last.x;
        const dy = world.y - g.last.y;
        if (dx === 0 && dy === 0) break;
        g.last = world;
        g.moved = true;
        const ids = new Set(this.store.selection);
        const next = this.store.page.objects
          .filter((o) => ids.has(o.id))
          .map((o) => translateObject(o, dx, dy));
        // The first mutation of a drag opens its own history step; every
        // update after that amends it, so the whole drag is one undo — and,
        // critically, it never gets folded into whatever step happened to be
        // on top of the stack before the drag started.
        this.store.updateMany(next, !g.committed);
        g.committed = true;
        break;
      }
      case 'resize': {
        const localPoint = g.localShape ? toShapeLocal(g.localShape, world) : world;
        const next = resizeBounds(g.startBounds, g.handle, localPoint);
        const updated = g.originals.map((o) => scaleObjectInto(o, g.startBounds, next));
        this.store.updateMany(updated, !g.committed);
        g.committed = true;
        break;
      }
      case 'rotate': {
        const angle = Math.atan2(world.y - g.center.y, world.x - g.center.x);
        let rotation = g.startRotation + (angle - g.startAngle);
        if (e.shiftKey) {
          // Shift constrains to 15° increments — the same modifier meaning as
          // everywhere else rotation appears.
          const step = Math.PI / 12;
          rotation = Math.round(rotation / step) * step;
        }
        const current = this.store.objectById(g.shapeId);
        if (current && current.type === 'shape') {
          this.store.updateObject({ ...current, rotation }, !g.committed);
          g.committed = true;
        }
        break;
      }
      case 'marquee': {
        this.store.ephemeral.marquee = rectFromPoints(g.origin, world);
        this.store.invalidate();
        break;
      }
      case 'endpoint': {
        const line = { ...g.line };
        if (g.which === 'a') line.a = world;
        else line.b = world;
        delete line[g.which === 'a' ? 'startBinding' : 'endBinding'];
        this.applyLineSnap(line, world, g.which === 'a' ? 'start' : 'end');
        this.store.updateObject(line, false);
        break;
      }
      case 'none':
        break;
    }

    this.updateCursor(screen);
  }

  onPointerUp(e: PointerEvent, screen: Point): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size >= 1) {
      // Lifting one finger of a pinch: restart cleanly rather than lurching.
      this.pinchStart = null;
      if (this.pointers.size === 1) {
        const remaining = [...this.pointers.values()][0];
        this.gesture = this.store.tool === 'hand' ? { kind: 'pan', last: remaining } : { kind: 'none' };
      }
      return;
    }

    const world = this.toWorld(screen);
    const g = this.gesture;
    const store = this.store;
    const tapped = !this.moved;

    switch (g.kind) {
      case 'pen':
        this.commitPen(g.object);
        break;
      case 'erase':
        break;
      case 'line':
        this.commitLine(g.object, tapped);
        break;
      case 'shape':
        this.commitShape(g.object, tapped);
        break;
      case 'move':
        // A tap that only just selected this object leaves it selected, with
        // its handles now visible — it does not also jump into editing it,
        // which used to happen so fast (both within the same tap) that the
        // handles never got a chance to be seen at all. Tapping something
        // already selected still edits it, same as before.
        if (tapped && !g.moved && g.wasSelected) this.handleSelectTap(world, e.pointerType, e.shiftKey);
        break;
      case 'resize':
      case 'rotate':
        break;
      case 'marquee': {
        const marquee = store.ephemeral.marquee;
        if (marquee) {
          const hits = store.page.objects.filter((o) => rectsIntersect(objectBounds(o), marquee));
          store.setSelection(hits.map((o) => o.id));
        }
        break;
      }
      case 'endpoint':
        break;
      case 'pan':
      case 'pinch':
      case 'none':
        if (tapped && store.tool === 'text') this.createTextAt(world);
        else if (tapped && store.tool === 'select') this.handleSelectTap(world, e.pointerType, e.shiftKey);
        break;
    }

    this.clearEphemeral();
    this.gesture = { kind: 'none' };
    this.downAt = null;
    this.downTarget = null;
    this.pinchStart = null;
    store.invalidate();
    this.updateCursor(screen);
  }

  onPointerCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    this.clearEphemeral();
    this.gesture = { kind: 'none' };
    this.pinchStart = null;
    this.store.invalidate();
  }

  /** Wheel zooms with ctrl/pinch, and pans otherwise — standard trackpad behaviour. */
  onWheel(e: WheelEvent, screen: Point): void {
    const store = this.store;
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY / 180);
      store.setCamera(zoomAbout(store.camera, screen, store.camera.zoom * factor));
    } else {
      store.setCamera({
        ...store.camera,
        x: store.camera.x + e.deltaX / store.camera.zoom,
        y: store.camera.y + e.deltaY / store.camera.zoom,
      });
    }
  }

  /* --------------------------------------------------------------- pinch -- */

  private beginPinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    // Abandon whatever single-pointer gesture was in flight; two fingers always
    // mean navigation, so a stray stroke never survives a pinch.
    if (this.gesture.kind === 'pen' || this.gesture.kind === 'shape' || this.gesture.kind === 'line') {
      this.clearEphemeral();
    }
    this.gesture = { kind: 'pinch' };
    this.pinchStart = {
      dist: dist(a, b),
      zoom: this.store.camera.zoom,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      camera: { x: this.store.camera.x, y: this.store.camera.y },
    };
  }

  private updatePinch(): void {
    const start = this.pinchStart;
    if (!start) return;
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const scale = dist(a, b) / Math.max(1, start.dist);
    const zoom = clamp(start.zoom * scale, MIN_ZOOM, MAX_ZOOM);
    // Zoom about the original midpoint, then pan by how far that midpoint moved:
    // two fingers pan and zoom in the same continuous gesture.
    const base = zoomAbout({ ...start.camera, zoom: start.zoom }, start.mid, zoom);
    this.store.setCamera({
      x: base.x - (mid.x - start.mid.x) / zoom,
      y: base.y - (mid.y - start.mid.y) / zoom,
      zoom,
    });
  }

  /* ----------------------------------------------------------- creations -- */

  private eventWorld(e: PointerEvent | { clientX: number; clientY: number }, fallback: Point): Point {
    const rect = this.rect;
    if (!rect || !('clientX' in e)) return this.toWorld(fallback);
    return this.toWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  /** Set by the view each frame so coalesced events can be converted cheaply. */
  rect: DOMRect | null = null;

  private beginErase(world: Point, pointerType: string): void {
    const removed = new Set<string>();
    this.gesture = { kind: 'erase', removed };
    this.eraseAt(world, pointerType, removed);
  }

  /** Erases whole objects, so one swipe removes a stroke rather than nibbling it. */
  private eraseAt(world: Point, pointerType: string, removed: Set<string>): void {
    const store = this.store;
    const target = pickObject(store.page.objects, world, this.tolerance(pointerType) * 1.5);
    if (!target || removed.has(target.id)) return;
    removed.add(target.id);
    // The first removal opens a history step; the rest of the swipe amends it.
    store.transaction(
      (doc) => deleteObjects(doc, store.currentPageId, [target.id]),
      removed.size === 1,
    );
  }

  private beginPen(world: Point, pressure: number, pointerType: string): void {
    const store = this.store;
    const object: DrawingObject & { type: 'pen' } = {
      id: newId(),
      type: 'pen',
      z: nextZ(store.page),
      points: [{ ...world, p: pressureOf(pressure, pointerType) }],
      color: store.style.color,
      size: store.style.size,
    };
    this.gesture = { kind: 'pen', object };
    store.ephemeral.draft = object;
  }

  private commitPen(object: DrawingObject & { type: 'pen' }): void {
    if (object.points.length < 2) {
      // A tap with the pen should still leave a dot.
      object.points.push({ ...object.points[0], x: object.points[0].x + 0.01 });
    }
    // The pen stays the active tool: a napkin sketch is many strokes in a row,
    // and switching away after each one would mean re-selecting Pen every time.
    this.store.addObject(structuredClone(object));
  }

  private beginLine(world: Point): void {
    const store = this.store;
    const object: LineObject = {
      id: newId(),
      type: 'line',
      z: nextZ(store.page),
      a: world,
      b: world,
      color: store.style.color,
      size: store.style.size,
      style: store.style.lineStyle,
      startArrow: store.style.startArrow,
      endArrow: store.style.endArrow,
    };
    this.applyLineSnap(object, world, 'start');
    this.gesture = { kind: 'line', object };
    store.ephemeral.draft = object;
  }

  private applyLineSnap(line: LineObject, world: Point, which: 'start' | 'end'): void {
    const store = this.store;
    const key = which === 'start' ? 'startBinding' : 'endBinding';
    if (!store.style.connector) {
      delete line[key];
      store.ephemeral.snapObjectId = null;
      store.ephemeral.snapPoint = null;
      return;
    }
    const snap = findSnap(store.page.objects, world, this.snapRadius(), line.id);
    if (snap) {
      line[key] = { objectId: snap.objectId, anchor: snap.anchor };
      store.ephemeral.snapObjectId = snap.objectId;
      store.ephemeral.snapPoint = snap.anchor === 'center' ? null : snap.point;
    } else {
      delete line[key];
      store.ephemeral.snapObjectId = null;
      store.ephemeral.snapPoint = null;
    }
  }

  private commitLine(object: LineObject, tapped: boolean): void {
    if (tapped) return;
    // Line stays active too, for the same reason as the pen: a diagram is
    // rarely just one connector.
    this.store.addObject(structuredClone(object), { select: false });
  }

  private beginShape(world: Point): void {
    const store = this.store;
    const object: ShapeObject = {
      id: newId(),
      type: 'shape',
      z: nextZ(store.page),
      kind: store.style.shapeKind,
      frame: { x: world.x, y: world.y, w: 1, h: 1 },
      rotation: 0,
      fill: store.style.shapeKind === 'note' && store.style.fill === null ? '#FEF3C7' : store.style.fill,
      stroke: store.style.strokeColor,
      size: store.style.size,
      text: '',
      textColor: store.style.color,
      fontSize: 20,
    };
    this.gesture = { kind: 'shape', origin: world, object };
    store.ephemeral.draft = object;
  }

  /**
   * Commits the drawn shape without selecting it or switching tools: Shape
   * stays active so the next drag makes another shape immediately, matching
   * "draw one rectangle after another" rather than "draw one, get bounced to
   * Select". Selection (and the bounding box that comes with it) is reserved
   * for the Select tool — switching tools always leaves nothing selected.
   */
  private commitShape(object: ShapeObject, tapped: boolean): void {
    const final = structuredClone(object);
    if (tapped || final.frame.w < 8 || final.frame.h < 8) {
      // A tap drops a default-sized shape centred on the tap — one gesture
      // instead of a drag, which matters a lot on a phone. Square (or
      // circular) by default for every kind but Arrow, which is inherently
      // wide — a squished rectangle-ish default was exactly what made a
      // tapped star, triangle, or heart look wrong next to its own toolbar
      // icon, which is drawn on a square canvas.
      const w = DEFAULT_SHAPE_SIZE;
      const h = object.kind === 'arrow' ? DEFAULT_SHAPE_SIZE * 0.66 : DEFAULT_SHAPE_SIZE;
      final.frame = {
        x: object.frame.x - w / 2,
        y: object.frame.y - h / 2,
        w,
        h,
      };
    }
    this.store.addObject(final);
  }

  private createTextAt(world: Point): void {
    const store = this.store;
    const object: TextObject = {
      id: newId(),
      type: 'text',
      z: nextZ(store.page),
      at: { x: world.x, y: world.y - store.style.fontSize / 2 },
      width: DEFAULT_TEXT_WIDTH,
      text: '',
      color: store.style.color,
      fontFamily: store.style.fontFamily,
      fontSize: store.style.fontSize,
      fontWeight: store.style.fontWeight,
      italic: store.style.italic,
      underline: store.style.underline,
      align: store.style.align,
    };
    store.addObject(object, { select: true });
    this.host.requestTextEdit(object.id);
    // A brand-new, still-empty text object has nothing for the bounding box
    // to usefully outline — skip the "show the box until the first
    // keystroke" grace period that re-opening an existing object's editor
    // gets, and go straight to just the caret.
    store.markEditingTouched();
  }

  /* ---------------------------------------------------------- select ops -- */

  private beginSelectGesture(screen: Point, world: Point, shiftKey: boolean): void {
    const store = this.store;

    const handleHit = this.pickHandle(screen);
    if (handleHit) {
      const originals = store.selectedObjects();
      if (handleHit.kind === 'rotate' && originals.length === 1 && originals[0].type === 'shape') {
        const shape = originals[0];
        const center = rectCenter(shape.frame);
        this.gesture = {
          kind: 'rotate',
          shapeId: shape.id,
          center,
          startAngle: Math.atan2(world.y - center.y, world.x - center.x),
          startRotation: shape.rotation,
          committed: false,
        };
        return;
      }
      if (handleHit.kind === 'resize') {
        const single = originals.length === 1 && originals[0].type === 'shape' ? originals[0] : null;
        // A single shape resizes in its own local space (so a rotated shape
        // resizes along its own axes); anything else resizes the plain
        // world-space bounding box.
        const startBounds = single ? single.frame : boundsOfObjects(originals);
        if (startBounds) {
          this.gesture = {
            kind: 'resize',
            handle: handleHit.handle,
            startBounds,
            originals,
            localShape: single,
            committed: false,
          };
        }
        return;
      }
    }

    // Dragging a selected line's endpoint rebinds the connector.
    const selected = store.selectedObjects();
    if (selected.length === 1 && selected[0].type === 'line') {
      const line = selected[0];
      const reach = 14 / store.camera.zoom;
      if (dist(world, line.a) < reach) {
        this.gesture = { kind: 'endpoint', line, which: 'a' };
        return;
      }
      if (dist(world, line.b) < reach) {
        this.gesture = { kind: 'endpoint', line, which: 'b' };
        return;
      }
    }

    const target = this.downTarget;
    if (target) {
      const wasSelected = !shiftKey && store.selection.length === 1 && store.selection[0] === target.id;
      if (shiftKey) {
        const has = store.selection.includes(target.id);
        store.setSelection(
          has ? store.selection.filter((id) => id !== target.id) : [...store.selection, target.id],
        );
      } else if (!store.selection.includes(target.id)) {
        store.setSelection([target.id]);
      }
      this.gesture = {
        kind: 'move',
        last: world,
        originals: store.selectedObjects(),
        moved: false,
        committed: false,
        wasSelected,
      };
      return;
    }

    // No object directly under the pointer, but the current selection's own
    // box still claims this point (its hollow interior, or the gap between
    // two multi-selected shapes) — grab it rather than starting a marquee.
    if (!shiftKey && store.selection.length > 0 && this.pointInSelectionBounds(world)) {
      this.gesture = {
        kind: 'move',
        last: world,
        originals: selected,
        moved: false,
        committed: false,
        wasSelected: true,
      };
      return;
    }

    if (!shiftKey) store.setSelection([]);
    this.gesture = { kind: 'marquee', origin: world };
  }

  /**
   * A tap with Select on a shape or text object goes straight into editing — no
   * modal, no second control to find. This is the product's core interaction.
   */
  private handleSelectTap(world: Point, pointerType: string, shiftKey: boolean): void {
    const store = this.store;
    const target = pickObject(store.page.objects, world, this.tolerance(pointerType));
    if (!target) {
      if (!shiftKey) store.setSelection([]);
      return;
    }
    if (target.type === 'shape' || target.type === 'text') {
      store.setSelection([target.id]);
      this.host.requestTextEdit(target.id);
    }
  }
}

/** Stylus pressure where the device reports it; a flat, natural weight where it doesn't. */
function pressureOf(pressure: number, pointerType: string): number {
  if (pointerType === 'pen' && pressure > 0 && pressure < 1) return clamp(pressure, 0.08, 1);
  return 0.6;
}

/**
 * Next local-space frame for a resize gesture. Corner handles drive both
 * dimensions from the pointer; edge handles drive only their own axis, so
 * dragging the right edge can't accidentally also move the top.
 */
export function resizeBounds(start: Rect, handle: HandleId, world: Point): Rect {
  switch (handle) {
    case 'nw':
      return normalizeRect(rectFromPoints({ x: start.x + start.w, y: start.y + start.h }, world));
    case 'ne':
      return normalizeRect(rectFromPoints({ x: start.x, y: start.y + start.h }, world));
    case 'se':
      return normalizeRect(rectFromPoints({ x: start.x, y: start.y }, world));
    case 'sw':
      return normalizeRect(rectFromPoints({ x: start.x + start.w, y: start.y }, world));
    case 'n':
      return normalizeRect({ x: start.x, y: Math.min(world.y, start.y + start.h), w: start.w, h: start.y + start.h - world.y });
    case 's':
      return normalizeRect({ x: start.x, y: start.y, w: start.w, h: world.y - start.y });
    case 'e':
      return normalizeRect({ x: start.x, y: start.y, w: world.x - start.x, h: start.h });
    case 'w':
      return normalizeRect({ x: Math.min(world.x, start.x + start.w), y: start.y, w: start.x + start.w - world.x, h: start.h });
  }
}

function normalizeRect(r: Rect): Rect {
  return { x: r.x, y: r.y, w: Math.max(4, r.w), h: Math.max(4, r.h) };
}
