import { renderScene, type SceneTheme } from '../../canvas/renderer/scene';
import type { DrawingPage, Rect } from '../../document/model/types';
import { pageBounds } from '../svg/exportSvg';

export interface PngOptions {
  background: string | null;
  padding: number;
  /** Multiplier over CSS pixels. Defaults to the device ratio, capped for memory. */
  scale: number;
  /** Mirrors the on-screen "Scrappy" mode. */
  scrappy: boolean;
}

const MAX_PIXELS = 32_000_000;

export interface PixelSize {
  width: number;
  height: number;
  scale: number;
}

/**
 * Pixel dimensions for an export, with the scale reduced when a large board
 * would otherwise allocate more pixels than a phone can hold.
 */
export function pngPixelSize(box: Rect, requestedScale: number): PixelSize {
  let scale = requestedScale;
  const area = box.w * box.h * scale * scale;
  if (area > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / area);
  // Floor, not round: rounding up after the cap can push a capped export back
  // over the pixel budget it was just brought under.
  return {
    width: Math.max(1, Math.floor(box.w * scale)),
    height: Math.max(1, Math.floor(box.h * scale)),
    scale,
  };
}

export function defaultPngOptions(): PngOptions {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  return { background: '#FFFFFF', padding: 32, scale: Math.min(3, Math.max(2, dpr)), scrappy: false };
}

/**
 * Renders a page to a PNG blob through the same scene renderer the screen uses,
 * with the camera framed on the drawing's bounds and all selection chrome off.
 */
export async function exportPageToPng(
  page: DrawingPage,
  options: Partial<PngOptions> = {},
): Promise<Blob> {
  const opts = { ...defaultPngOptions(), ...options };
  const box = pageBounds(page, opts.padding);

  const { width, height, scale } = pngPixelSize(box, opts.scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a canvas for export.');

  const theme: SceneTheme = {
    // A transparent fill is a no-op against a cleared canvas, so the same code
    // path produces both the white-backed and transparent exports.
    page: opts.background ?? 'rgba(0,0,0,0)',
    grid: 'transparent',
    accent: '#000000',
    accentSoft: 'transparent',
    handleFill: '#FFFFFF',
  };

  renderScene(ctx, {
    objects: page.objects,
    camera: { x: box.x, y: box.y, zoom: 1 },
    width: box.w,
    height: box.h,
    dpr: scale,
    selection: new Set(),
    ephemeral: { draft: null, marquee: null, snapObjectId: null, snapPoint: null },
    showGrid: false,
    theme,
    showOverlay: false,
    scrappy: opts.scrappy,
  });

  return toBlob(canvas);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('This browser could not produce a PNG.'));
    }, 'image/png');
  });
}
