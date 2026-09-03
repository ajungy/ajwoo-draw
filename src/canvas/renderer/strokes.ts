import getStroke from 'perfect-freehand';
import type { PenStroke, StrokePoint } from '../../document/model/types';

/**
 * perfect-freehand turns sampled points into a tapered outline polygon. Both the
 * canvas renderer and the SVG exporter consume this same path data, so an
 * exported stroke is pixel-identical to the one on screen.
 */
export function penOutlinePath(stroke: PenStroke): string {
  const points = stroke.points.map((p: StrokePoint) => [p.x, p.y, p.p] as [number, number, number]);
  const outline = getStroke(points, {
    size: stroke.size,
    thinning: 0.55,
    smoothing: 0.55,
    streamline: 0.42,
    simulatePressure: false,
    last: true,
  });
  return outlineToPath(outline);
}

function outlineToPath(outline: number[][]): string {
  if (outline.length === 0) return '';
  const n = (v: number) => Math.round(v * 100) / 100;
  // Quadratics through segment midpoints keep the outline smooth without
  // emitting a vertex per sample.
  let d = `M ${n(outline[0][0])} ${n(outline[0][1])}`;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    d += ` Q ${n(a[0])} ${n(a[1])} ${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}`;
  }
  return `${d} Z`;
}
