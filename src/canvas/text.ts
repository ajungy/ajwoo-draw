import type { FontFamily } from '../document/model/types';

/** Resolved stacks for canvas + SVG, which cannot read CSS custom properties. */
export const RESOLVED_FONT_STACKS: Record<FontFamily, string> = {
  sans: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  hand: '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
};

export const LINE_HEIGHT = 1.35;

export interface FontSpec {
  family: FontFamily;
  size: number;
  weight: number;
  italic: boolean;
}

export function cssFont(f: FontSpec): string {
  return `${f.italic ? 'italic ' : ''}${f.weight} ${f.size}px ${RESOLVED_FONT_STACKS[f.family]}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

function ctx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

export function measureText(text: string, font: FontSpec): number {
  const key = `${font.family}|${font.size}|${font.weight}|${font.italic}|${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  const c = ctx();
  // Fallback keeps wrapping deterministic in non-DOM environments (tests, SSR).
  const width = c ? ((c.font = cssFont(font)), c.measureText(text).width) : text.length * font.size * 0.55;
  if (widthCache.size > 5000) widthCache.clear();
  widthCache.set(key, width);
  return width;
}

/**
 * Greedy word wrap, breaking over-long words by character so a single URL can
 * never blow past the wrap width.
 */
export function wrapText(text: string, font: FontSpec, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      if (word === '') continue;
      const candidate = line + word;
      if (line !== '' && measureText(candidate, font) > maxWidth) {
        out.push(line.trimEnd());
        line = word.trimStart();
        while (measureText(line, font) > maxWidth && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && measureText(line.slice(0, cut), font) > maxWidth) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        line = candidate;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export function textBlockHeight(lines: number, fontSize: number): number {
  return Math.max(1, lines) * fontSize * LINE_HEIGHT;
}
