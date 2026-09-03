import { describe, expect, it, vi } from 'vitest';
import { renderScene, type SceneTheme } from '../src/canvas/renderer/scene';
import { line, pen, shape, text } from './factories';
import type { DrawingObject } from '../src/document/model/types';

/**
 * jsdom has no 2D context, so the renderer is exercised against a recording
 * stub. That is enough to pin the behaviour that actually breaks in practice:
 * the device-pixel transform, viewport culling, and whether selection chrome is
 * drawn — none of which need real pixels to verify.
 */
function recordingContext() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const record = (fn: string) => (...args: unknown[]) => void calls.push({ fn, args });
  const ctx = {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    save: record('save'),
    restore: record('restore'),
    scale: record('scale'),
    translate: record('translate'),
    rotate: record('rotate'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    arc: record('arc'),
    roundRect: record('roundRect'),
    setLineDash: record('setLineDash'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillText: record('fillText'),
    measureText: () => ({ width: 10 }),
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

const theme: SceneTheme = {
  page: '#FFFFFF',
  grid: '#EDEDF0',
  accent: '#2563EB',
  accentSoft: 'rgba(37,99,235,0.12)',
  handleFill: '#FFFFFF',
};

function render(objects: DrawingObject[], overrides: Partial<Parameters<typeof renderScene>[1]> = {}) {
  const ctx = recordingContext();
  renderScene(ctx, {
    objects,
    camera: { x: 0, y: 0, zoom: 1 },
    width: 400,
    height: 400,
    dpr: 2,
    selection: new Set(),
    ephemeral: { draft: null, marquee: null, snapObjectId: null, snapPoint: null },
    showGrid: false,
    theme,
    showOverlay: true,
    ...overrides,
  });
  return ctx;
}

// Path2D is a browser primitive jsdom lacks; the renderer only stores it.
vi.stubGlobal('Path2D', class {
  constructor(readonly d?: string) {}
});

describe('scene renderer', () => {
  it('applies the device pixel ratio before anything is drawn', () => {
    const ctx = render([]);
    expect(ctx.calls[0]).toMatchObject({ fn: 'setTransform', args: [2, 0, 0, 2, 0, 0] });
  });

  it('paints the page background', () => {
    const ctx = render([]);
    expect(ctx.calls.some((c) => c.fn === 'fillRect')).toBe(true);
  });

  it('culls objects outside the viewport', () => {
    const onscreen = shape({ frame: { x: 10, y: 10, w: 50, h: 50 }, fill: '#FFFFFF' });
    const offscreen = shape({ frame: { x: 90000, y: 90000, w: 50, h: 50 }, fill: '#FFFFFF' });

    const drawn = (objects: DrawingObject[]) =>
      render(objects).calls.filter((c) => c.fn === 'fill').length;

    expect(drawn([onscreen])).toBe(1);
    expect(drawn([offscreen])).toBe(0);
    expect(drawn([onscreen, offscreen])).toBe(1);
  });

  it('draws the in-progress object on top of the committed page', () => {
    const draft = pen();
    const ctx = render([], {
      ephemeral: { draft, marquee: null, snapObjectId: null, snapPoint: null },
    });
    expect(ctx.calls.some((c) => c.fn === 'fill')).toBe(true);
  });

  it('redraws the in-progress stroke as points are added, rather than freezing the first frame', () => {
    // The interaction layer mutates the draft object's own `points` array in
    // place across a drag — it never gets a new identity until commit. A path
    // cache keyed by object identity would build its outline once, from
    // whatever the array looked like on the very first frame, and never touch
    // it again: the classic "line doesn't appear until you let go" bug.
    const draft = pen({ points: [{ x: 0, y: 0, p: 0.5 }] });
    const firstFrame = render([], {
      ephemeral: { draft, marquee: null, snapObjectId: null, snapPoint: null },
    });
    draft.points.push({ x: 10, y: 10, p: 0.5 }, { x: 20, y: 0, p: 0.5 });
    const laterFrame = render([], {
      ephemeral: { draft, marquee: null, snapObjectId: null, snapPoint: null },
    });
    expect(laterFrame.calls.some((c) => c.fn === 'fill')).toBe(true);
    // Both frames drew *something*, but they must not be the exact same
    // stub Path2D instance reused from a stale cache.
    const pathOf = (calls: typeof firstFrame.calls) => calls.find((c) => c.fn === 'fill')?.args[0];
    expect(pathOf(laterFrame.calls)).not.toBe(pathOf(firstFrame.calls));
  });

  it('draws selection chrome only when the overlay is on', () => {
    const box = shape();
    const withChrome = render([box], { selection: new Set([box.id]) });
    const exportLike = render([box], { selection: new Set([box.id]), showOverlay: false });
    expect(withChrome.calls.some((c) => c.fn === 'strokeRect')).toBe(true);
    expect(exportLike.calls.some((c) => c.fn === 'strokeRect')).toBe(false);
  });

  it('outlines the shape a connector would snap to', () => {
    const box = shape();
    const without = render([box]);
    const withSnap = render([box], {
      ephemeral: { draft: null, marquee: null, snapObjectId: box.id, snapPoint: null },
    });
    expect(without.calls.filter((c) => c.fn === 'strokeRect')).toHaveLength(0);
    expect(withSnap.calls.filter((c) => c.fn === 'strokeRect')).toHaveLength(1);
  });

  it('draws the dotted grid only when it is turned on', () => {
    expect(render([], { showGrid: false }).calls.some((c) => c.fn === 'arc')).toBe(false);
    expect(render([], { showGrid: true }).calls.some((c) => c.fn === 'arc')).toBe(true);
  });

  it('renders every object type without throwing', () => {
    const ctx = render([
      pen(),
      shape({ text: 'Login', fill: '#FFFFFF' }),
      line({ endArrow: 'arrow', style: 'dashed' }),
      text({ text: 'note', underline: true }),
    ]);
    expect(ctx.calls.some((c) => c.fn === 'fillText')).toBe(true);
    expect(ctx.calls.some((c) => c.fn === 'setLineDash')).toBe(true);
  });
});
