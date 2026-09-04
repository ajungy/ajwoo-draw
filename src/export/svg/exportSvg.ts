import { arrowHeadPoints, dashPattern, lineEndpoints } from '../../canvas/renderer/drawObject';
import { jitterStrokePoints, lineWobbleAmplitude, seedFromId, shapeWobbleAmplitude, sketchPolyline, sketchVertices } from '../../canvas/sketch';
import { penOutlinePath } from '../../canvas/renderer/strokes';
import { labelInset, shapePathData } from '../../canvas/shapes';
import { LINE_HEIGHT, RESOLVED_FONT_STACKS, wrapText, type FontSpec } from '../../canvas/text';
import { boundsOfObjects, textLines } from '../../document/model/objects';
import { expandRect, rectCenter } from '../../geometry';
import type {
  DrawingObject,
  DrawingPage,
  LineObject,
  Rect,
  ShapeObject,
  TextObject,
} from '../../document/model/types';

export interface SvgOptions {
  /** Solid background colour, or null for a transparent export. */
  background: string | null;
  padding: number;
  /** Mirrors the on-screen "Scrappy" mode: hand-drawn edges, handwritten text. */
  scrappy: boolean;
}

export const DEFAULT_SVG_OPTIONS: SvgOptions = { background: '#FFFFFF', padding: 32, scrappy: false };

/** Escapes the five XML metacharacters. All user text goes through here. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function pageBounds(page: DrawingPage, padding: number): Rect {
  const bounds = boundsOfObjects(page.objects);
  if (!bounds || bounds.w === 0 || bounds.h === 0) {
    const fallback = bounds ?? { x: 0, y: 0, w: 0, h: 0 };
    return expandRect({ ...fallback, w: Math.max(fallback.w, 1), h: Math.max(fallback.h, 1) }, padding);
  }
  return expandRect(bounds, padding);
}

/**
 * Produces a clean, self-contained SVG: plain paths and text, no scripts, no
 * external references, no embedded HTML. It opens directly in Figma, Illustrator,
 * or a browser.
 */
export function exportPageToSvg(page: DrawingPage, options: Partial<SvgOptions> = {}): string {
  const opts = { ...DEFAULT_SVG_OPTIONS, ...options };
  const box = pageBounds(page, opts.padding);
  const lookup = (id: string): DrawingObject | undefined => page.objects.find((o) => o.id === id);

  const body = page.objects.map((o) => objectToSvg(o, lookup, opts.scrappy)).filter(Boolean).join('\n  ');
  const bg = opts.background
    ? `\n  <rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" fill="${opts.background}"/>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(box.w)}" height="${n(box.h)}" ` +
    `viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}">` +
    `\n  <title>${escapeXml(page.name)}</title>${bg}\n  ${body}\n</svg>\n`
  );
}

const n = (v: number): number => Math.round(v * 100) / 100;

function objectToSvg(
  o: DrawingObject,
  lookup: (id: string) => DrawingObject | undefined,
  scrappy: boolean,
): string {
  switch (o.type) {
    case 'pen': {
      const d = scrappy
        ? penOutlinePath({ ...o, points: jitterStrokePoints(o.points, seedFromId(o.id), o.size) })
        : penOutlinePath(o);
      return `<path d="${d}" fill="${o.color}" fill-rule="nonzero"/>`;
    }
    case 'shape':
      return shapeToSvg(o, scrappy);
    case 'line':
      return lineToSvg(o, lookup, scrappy);
    case 'text':
      return textToSvg(o, scrappy);
  }
}

function shapeToSvg(o: ShapeObject, scrappy: boolean): string {
  const c = rectCenter(o.frame);
  const transform = o.rotation === 0 ? '' : ` transform="rotate(${n((o.rotation * 180) / Math.PI)} ${n(c.x)} ${n(c.y)})"`;
  const fill = o.fill ?? 'none';
  // The fill always traces the true (clean) outline — only the stroke wobbles —
  // otherwise a sketchy edge that dips inside the true boundary would leave a
  // visible sliver of unfilled paper between fill and stroke.
  const fillShape = `<path d="${shapePathData(o.kind, o.frame)}" fill="${fill}" stroke="none"/>`;
  const strokeShape =
    o.size > 0 && o.stroke
      ? scrappy
        ? `<path d="${sketchPolyline(sketchVertices(o.kind, o.frame), seedFromId(o.id), shapeWobbleAmplitude(o.frame.w, o.frame.h), true)}" ` +
          `fill="none" stroke="${o.stroke}" stroke-width="${n(o.size)}" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${shapePathData(o.kind, o.frame)}" fill="none" stroke="${o.stroke}" ` +
          `stroke-width="${n(o.size)}" stroke-linejoin="round"/>`
      : '';
  const path = fillShape + strokeShape;
  if (o.text.trim() === '') return `<g${transform}>${path}</g>`;

  const inset = labelInset(o.kind);
  const maxWidth = Math.max(16, o.frame.w * (1 - inset.x * 2));
  const font: FontSpec = { family: scrappy ? 'hand' : 'sans', size: o.fontSize, weight: 500, italic: false };
  const lines = wrapText(o.text, font, maxWidth);
  const lineH = o.fontSize * LINE_HEIGHT;
  const top = c.y - ((lines.length - 1) * lineH) / 2;
  const tspans = lines
    .map((line, i) => `<tspan x="${n(c.x)}" y="${n(top + i * lineH)}">${escapeXml(line)}</tspan>`)
    .join('');
  const label =
    `<text font-family="${escapeXml(RESOLVED_FONT_STACKS[font.family])}" font-size="${n(o.fontSize)}" ` +
    `font-weight="500" fill="${o.textColor}" text-anchor="middle" dominant-baseline="central">${tspans}</text>`;
  return `<g${transform}>${path}${label}</g>`;
}

function lineToSvg(o: LineObject, lookup: (id: string) => DrawingObject | undefined, scrappy: boolean): string {
  const [a, b] = lineEndpoints(o, lookup);
  // An open chevron doesn't cover the line the way a filled triangle did, so
  // the shaft runs all the way to the true endpoint underneath it.
  const lineStart = a;
  const lineEnd = b;
  const dash = dashPattern(o.style, o.size);
  const dashAttr = dash.length ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : '';

  const shaft = scrappy
    ? `<path d="${sketchPolyline([lineStart, lineEnd], seedFromId(o.id), lineWobbleAmplitude(Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y)), false)}" fill="none" ` +
      `stroke="${o.color}" stroke-width="${n(o.size)}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`
    : `<line x1="${n(lineStart.x)}" y1="${n(lineStart.y)}" x2="${n(lineEnd.x)}" y2="${n(lineEnd.y)}" ` +
      `stroke="${o.color}" stroke-width="${n(o.size)}"${dashAttr}${o.style === 'dotted' ? ' stroke-linecap="round"' : ''}/>`;
  const parts = [shaft];
  // Arrow heads are open chevrons — a polyline, not a filled polygon — so the
  // file stays flat and editable in any vector tool while still matching the
  // toolbar's own line-style arrow icons.
  if (o.endArrow === 'arrow') parts.push(arrowChevron(a, b, o.size, o.color));
  if (o.startArrow === 'arrow') parts.push(arrowChevron(b, a, o.size, o.color));
  return parts.join('');
}

function arrowChevron(from: { x: number; y: number }, to: { x: number; y: number }, size: number, color: string): string {
  const [tip, l, r] = arrowHeadPoints(from, to, size);
  // Left wing → tip → right wing, so the polyline traces one open "V"
  // instead of `arrowHeadPoints`' own tip-first order zigzagging across it.
  const pts = [l, tip, r].map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
  return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${n(size)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function textToSvg(o: TextObject, scrappy: boolean): string {
  const font: FontSpec = scrappy ? { family: 'hand', size: o.fontSize, weight: o.fontWeight, italic: o.italic } : { family: o.fontFamily, size: o.fontSize, weight: o.fontWeight, italic: o.italic };
  const lines = scrappy ? wrapText(o.text, font, o.width) : textLines(o);
  const lineH = o.fontSize * LINE_HEIGHT;
  const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
  const x = o.align === 'center' ? o.at.x + o.width / 2 : o.align === 'right' ? o.at.x + o.width : o.at.x;
  const tspans = lines
    .map((line, i) => `<tspan x="${n(x)}" y="${n(o.at.y + lineH * i + o.fontSize)}">${escapeXml(line)}</tspan>`)
    .join('');
  const decoration = o.underline ? ' text-decoration="underline"' : '';
  const style = font.italic ? ' font-style="italic"' : '';
  return (
    `<text font-family="${escapeXml(RESOLVED_FONT_STACKS[font.family])}" font-size="${n(o.fontSize)}" ` +
    `font-weight="${font.weight}" fill="${o.color}" text-anchor="${anchor}"${style}${decoration}>${tspans}</text>`
  );
}
