import type { Rect, ShapeKind } from '../document/model/types';

/**
 * Shape outlines are produced once, as SVG path data in world coordinates.
 * Canvas draws them via `new Path2D(d)` and the SVG exporter writes the same
 * string straight into a `<path d>`, so the two renderers can never drift.
 */
export function shapePathData(kind: ShapeKind, r: Rect): string {
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const n = (v: number) => Math.round(v * 100) / 100;

  switch (kind) {
    case 'rectangle':
      return roundedRect(r, Math.min(8, w / 4, h / 4));

    case 'note':
      // A note is a rectangle with one corner folded away, drawn square-ish.
      return roundedRect(r, 2);

    case 'ellipse': {
      const rx = w / 2;
      const ry = h / 2;
      return (
        `M ${n(cx - rx)} ${n(cy)} ` +
        `a ${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0 ` +
        `a ${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0 Z`
      );
    }

    case 'triangle':
      return `M ${n(cx)} ${n(y)} L ${n(x + w)} ${n(y + h)} L ${n(x)} ${n(y + h)} Z`;

    case 'star': {
      const spikes = 5;
      const outerX = w / 2;
      const outerY = h / 2;
      const inner = 0.4;
      const pts: string[] = [];
      for (let i = 0; i < spikes * 2; i++) {
        const k = i % 2 === 0 ? 1 : inner;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        pts.push(`${n(cx + Math.cos(angle) * outerX * k)} ${n(cy + Math.sin(angle) * outerY * k)}`);
      }
      return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
    }

    case 'arrow': {
      // A block arrow pointing right, proportioned off the frame.
      const tail = h * 0.28;
      const headW = Math.min(w * 0.4, h * 0.6);
      const top = cy - tail;
      const bot = cy + tail;
      return (
        `M ${n(x)} ${n(top)} L ${n(x + w - headW)} ${n(top)} L ${n(x + w - headW)} ${n(y)} ` +
        `L ${n(x + w)} ${n(cy)} L ${n(x + w - headW)} ${n(y + h)} ` +
        `L ${n(x + w - headW)} ${n(bot)} L ${n(x)} ${n(bot)} Z`
      );
    }

    case 'heart': {
      const topY = y + h * 0.3;
      return (
        `M ${n(cx)} ${n(y + h)} ` +
        `C ${n(x - w * 0.1)} ${n(y + h * 0.55)} ${n(x)} ${n(y)} ${n(cx)} ${n(topY)} ` +
        `C ${n(x + w)} ${n(y)} ${n(x + w * 1.1)} ${n(y + h * 0.55)} ${n(cx)} ${n(y + h)} Z`
      );
    }
  }
}

function roundedRect(r: Rect, radius: number): string {
  const rr = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  const n = (v: number) => Math.round(v * 100) / 100;
  const { x, y, w, h } = r;
  if (rr === 0) return `M ${n(x)} ${n(y)} h ${n(w)} v ${n(h)} h ${n(-w)} Z`;
  return (
    `M ${n(x + rr)} ${n(y)} H ${n(x + w - rr)} A ${n(rr)} ${n(rr)} 0 0 1 ${n(x + w)} ${n(y + rr)} ` +
    `V ${n(y + h - rr)} A ${n(rr)} ${n(rr)} 0 0 1 ${n(x + w - rr)} ${n(y + h)} ` +
    `H ${n(x + rr)} A ${n(rr)} ${n(rr)} 0 0 1 ${n(x)} ${n(y + h - rr)} ` +
    `V ${n(y + rr)} A ${n(rr)} ${n(rr)} 0 0 1 ${n(x + rr)} ${n(y)} Z`
  );
}

/** Inset available to a shape's centred label, as a fraction of the frame. */
export function labelInset(kind: ShapeKind): { x: number; y: number } {
  switch (kind) {
    case 'ellipse':
      return { x: 0.15, y: 0.18 };
    case 'triangle':
      return { x: 0.22, y: 0.4 };
    case 'star':
      return { x: 0.3, y: 0.34 };
    case 'heart':
      return { x: 0.22, y: 0.3 };
    case 'arrow':
      return { x: 0.12, y: 0.28 };
    default:
      return { x: 0.08, y: 0.1 };
  }
}
