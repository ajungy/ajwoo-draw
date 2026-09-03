import type { Point, Rect, ShapeKind } from '../document/model/types';

/**
 * "Scrappy" mode geometry: turns straight, geometric edges into a hand-drawn
 * wobble. Every function here is pure and seeded only by the object's own id
 * (never by time or randomness at draw time), so an object's sketchy outline
 * is stable frame to frame and identical whether it is drawn on the canvas or
 * written into an SVG export — the two must never disagree about what a
 * "sketchy" version of a shape looks like.
 */

/** Turns a short string id into a stable 32-bit seed. */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A tiny deterministic PRNG (mulberry32) — no dependency earns its keep for this. */
function rngFrom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v: number): number => Math.round(v * 100) / 100;

/**
 * A hand-drawn take on one straight edge: two overlapping, gently bowed
 * curves offset from the true line by a small perpendicular jitter — the way
 * a pencil doesn't quite retrace the same stroke twice. Returns two open SVG
 * path fragments, meant to both be stroked.
 */
function sketchEdge(a: Point, b: Point, seed: number, amplitude: number): [string, string] {
  const rand = rngFrom(seed);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow = () => (rand() - 0.5) * 2 * amplitude;
  const stroke = () => {
    const o1 = bow();
    const o2 = bow();
    const p1x = a.x + dx * 0.33 + nx * o1;
    const p1y = a.y + dy * 0.33 + ny * o1;
    const p2x = a.x + dx * 0.67 + nx * o2;
    const p2y = a.y + dy * 0.67 + ny * o2;
    return `M ${n(a.x)} ${n(a.y)} C ${n(p1x)} ${n(p1y)} ${n(p2x)} ${n(p2y)} ${n(b.x)} ${n(b.y)}`;
  };
  return [stroke(), stroke()];
}

/**
 * Wobble amplitude for a shape's own outline, scaled off the shape's smaller
 * dimension — a business card and a whiteboard-sized rectangle shouldn't wobble
 * by the same number of pixels. Deliberately *not* scaled off stroke width:
 * that ranges 2–16px, an order of magnitude too small a signal to draw a
 * "clearly hand-drawn, not a machine line" amplitude from.
 */
export function shapeWobbleAmplitude(w: number, h: number): number {
  return Math.min(7, Math.max(2.5, Math.min(w, h) * 0.035));
}

/** A line's wobble stays roughly constant regardless of length — a hand
 *  doesn't shake more just because the line is longer — clamped down only for
 *  a genuinely short segment. */
export function lineWobbleAmplitude(length: number): number {
  return Math.min(4, Math.max(1.5, length * 0.02));
}

/** The sketchy outline of an open or closed polyline — a double-stroked edge
 *  for every segment, seeded so each edge wobbles a little differently. */
export function sketchPolyline(points: Point[], seed: number, amplitude: number, closed: boolean): string {
  const segments = closed ? points.length : points.length - 1;
  let d = '';
  for (let i = 0; i < segments; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const [s1, s2] = sketchEdge(a, b, seed + i * 97, amplitude);
    d += `${s1} ${s2} `;
  }
  return d.trim();
}

/** A subtle per-point jitter for pen strokes — perfect-freehand already reads
 *  as hand-drawn, so this only needs to rough up the edge slightly further,
 *  not reinvent it. Displacement shrinks for thin strokes. */
export function jitterStrokePoints<P extends Point>(points: P[], seed: number, strokeSize: number): P[] {
  const rand = rngFrom(seed);
  const amplitude = Math.min(1.6, Math.max(0.4, strokeSize / 10));
  return points.map((p) => ({
    ...p,
    x: p.x + (rand() - 0.5) * 2 * amplitude,
    y: p.y + (rand() - 0.5) * 2 * amplitude,
  }));
}

/**
 * Vertex list approximating a shape's outline, reusing the same construction
 * as the clean renderer (`shapePathData`) so the sketchy version reads as the
 * same shape, just hand-drawn. Curved shapes (ellipse, heart) are sampled into
 * a polygon fine enough that the wobble reads as texture, not faceting.
 */
export function sketchVertices(kind: ShapeKind, frame: Rect): Point[] {
  const { x, y, w, h } = frame;
  const cx = x + w / 2;
  const cy = y + h / 2;

  switch (kind) {
    case 'rectangle':
    case 'note':
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];

    case 'ellipse': {
      const rx = w / 2;
      const ry = h / 2;
      const steps = 28;
      return Array.from({ length: steps }, (_, i) => {
        const a = (i / steps) * Math.PI * 2;
        return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
      });
    }

    case 'triangle':
      return [
        { x: cx, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];

    case 'star': {
      const spikes = 5;
      const outerX = w / 2;
      const outerY = h / 2;
      const inner = 0.4;
      const pts: Point[] = [];
      for (let i = 0; i < spikes * 2; i++) {
        const k = i % 2 === 0 ? 1 : inner;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        pts.push({ x: cx + Math.cos(angle) * outerX * k, y: cy + Math.sin(angle) * outerY * k });
      }
      return pts;
    }

    case 'arrow': {
      const tail = h * 0.28;
      const headW = Math.min(w * 0.4, h * 0.6);
      const top = cy - tail;
      const bot = cy + tail;
      return [
        { x, y: top },
        { x: x + w - headW, y: top },
        { x: x + w - headW, y },
        { x: x + w, y: cy },
        { x: x + w - headW, y: y + h },
        { x: x + w - headW, y: bot },
        { x, y: bot },
      ];
    }

    case 'heart': {
      // Sampled from the same cubic curves as the clean heart, via De Casteljau.
      const topY = y + h * 0.3;
      const cubic = (p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] =>
        Array.from({ length: steps }, (_, i) => {
          const t = i / steps;
          const u = 1 - t;
          return {
            x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
            y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
          };
        });
      const left = cubic(
        { x: cx, y: y + h },
        { x: x - w * 0.1, y: y + h * 0.55 },
        { x, y },
        { x: cx, y: topY },
        10,
      );
      const right = cubic(
        { x: cx, y: topY },
        { x: x + w, y },
        { x: x + w * 1.1, y: y + h * 0.55 },
        { x: cx, y: y + h },
        10,
      );
      return [...left, ...right];
    }
  }
}
