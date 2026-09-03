import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useEditor } from '../app/useStore';
import { renderScene, type SceneTheme } from './renderer/scene';
import { CanvasController } from './interaction/controller';

interface CanvasViewProps {
  onRequestTextEdit: (id: string) => void;
  controllerRef: React.MutableRefObject<CanvasController | null>;
}

/** Reads the resolved design-system colours the 2D context needs as literals. */
function readTheme(el: HTMLElement): SceneTheme {
  const s = getComputedStyle(el);
  return {
    page: s.getPropertyValue('--canvas-page').trim() || '#FFFFFF',
    grid: s.getPropertyValue('--canvas-grid').trim() || '#E4E4E7',
    accent: s.getPropertyValue('--canvas-accent').trim() || '#2563EB',
    accentSoft: s.getPropertyValue('--canvas-accent-soft').trim() || 'rgba(37,99,235,0.12)',
    handleFill: s.getPropertyValue('--canvas-handle').trim() || '#FFFFFF',
  };
}

export function CanvasView({ onRequestTextEdit, controllerRef }: CanvasViewProps) {
  // Subscribed so the cursor tracks the active tool.
  const store = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef<SceneTheme | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  // `onRequestTextEdit` is typically a fresh closure every render. Read through
  // a ref rather than depending on it directly: the pointer-wiring effect below
  // must never tear down and rebuild the controller mid-gesture — selecting an
  // object on pointerdown re-renders the app (the contextual bar appears)
  // *before* the matching pointerup fires, and if that re-render recreated the
  // controller, the up event would land on a brand-new instance with no memory
  // of the gesture the down event started, silently discarding it.
  const onRequestTextEditRef = useRef(onRequestTextEdit);
  onRequestTextEditRef.current = onRequestTextEdit;
  const frameRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !themeRef.current) return;
    const { width, height, dpr } = sizeRef.current;
    renderScene(ctx, {
      objects: store.page.objects,
      camera: store.camera,
      width,
      height,
      dpr,
      selection: new Set(store.selection),
      ephemeral: store.ephemeral,
      showGrid: store.showGrid,
      theme: themeRef.current,
      // Selection chrome would only get in the way of the text being edited.
      showOverlay: store.editingTextId === null,
      editingId: store.editingTextId,
    });
  }, [store]);

  const invalidate = useCallback(() => {
    // Cancel-then-reschedule, not "skip if one is pending": in StrictMode's
    // dev-only mount→unmount→mount, the unmount cleanup cancels the pending
    // frame without knowing it, and a "skip if non-null" guard would then
    // believe a frame is still coming and never schedule another — leaving
    // the canvas permanently unpainted. Cancelling a stale or already-fired
    // id is a harmless no-op, so this still coalesces to one paint per frame.
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  /* ------------------------------------------------------------- sizing -- */

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    themeRef.current = readTheme(canvas);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Cap the ratio: a 4x phone screen triples fill cost for no visible gain.
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      invalidate();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => {
      themeRef.current = readTheme(canvas);
      invalidate();
    };
    scheme.addEventListener('change', onScheme);

    return () => {
      observer.disconnect();
      scheme.removeEventListener('change', onScheme);
    };
  }, [invalidate]);

  useEffect(() => store.subscribeRender(invalidate), [store, invalidate]);
  useEffect(() => store.subscribeApp(invalidate), [store, invalidate]);
  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  /* ------------------------------------------------------------ pointers -- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new CanvasController({
      store,
      requestTextEdit: (id) => onRequestTextEditRef.current(id),
      // State-dependent cursors (resize handles, rotate, move-on-hover) are
      // written directly to the element: they change at pointer frequency and
      // have no business going through React.
      onCursor: (cursor) => {
        canvas.style.cursor = cursor;
      },
    });
    controllerRef.current = controller;

    // The canvas's own bounding rect is re-measured on every pointerdown, then
    // frozen for the rest of that gesture. Selecting something can add or
    // remove the contextual bar above the canvas within the same tick — a
    // synchronous layout shift caused by the very gesture reading it — so a
    // move or up event re-measuring mid-gesture would convert its screen
    // coordinate against a canvas position that has already moved out from
    // under it. Freezing it at the start is what a real trackpad/touch
    // digitiser effectively does anyway: the transform is fixed once contact
    // begins.
    let gestureRect: DOMRect = canvas.getBoundingClientRect();

    const toLocal = (e: PointerEvent | WheelEvent) => {
      controller.rect = gestureRect;
      return { x: e.clientX - gestureRect.left, y: e.clientY - gestureRect.top };
    };

    const down = (e: PointerEvent) => {
      gestureRect = canvas.getBoundingClientRect();
      // Capture keeps the gesture alive if the finger leaves the canvas. It can
      // throw for a pointer the browser no longer considers active, which must
      // not cost the user the stroke they are starting.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* proceed without capture */
      }
      controller.onPointerDown(e, toLocal(e));
    };
    const move = (e: PointerEvent) => controller.onPointerMove(e, toLocal(e));
    const up = (e: PointerEvent) => {
      try {
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* nothing to release */
      }
      controller.onPointerUp(e, toLocal(e));
      // The gesture is over; the next one (including a hover-only move) should
      // see the canvas's real, current position again.
      gestureRect = canvas.getBoundingClientRect();
    };
    const cancel = (e: PointerEvent) => {
      controller.onPointerCancel(e);
      gestureRect = canvas.getBoundingClientRect();
    };
    // Passive: false so pinch-zooming the canvas never zooms the page instead.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      controller.onWheel(e, toLocal(e));
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('wheel', wheel);
      controllerRef.current = null;
    };
  }, [store, controllerRef]);

  return <canvas ref={canvasRef} className="canvas" data-tool={store.tool} aria-hidden="true" />;
}
