import type { HandleId } from './renderer/scene';

/**
 * Cursors for interaction states the platform has no keyword for. Per-tool
 * default cursors (pen, hand, text) are static and live in CSS via
 * `.canvas[data-tool]`; what belongs here is state that depends on where the
 * pointer is relative to the current selection, which only the interaction
 * layer knows moment to moment.
 */

/** Two curved arrows chasing each other, centred on the hotspot. */
export const ROTATE_CURSOR =
  `url("data:image/svg+xml,` +
  `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'>` +
  `<g fill='none' stroke='%23000000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>` +
  `<path d='M8 4.8A8.4 8.4 0 1 1 4.6 9'/><path d='M3.4 4.4v4.8h4.8'/>` +
  `<path d='M18 21.2A8.4 8.4 0 0 0 21.4 17'/><path d='M22.6 21.6v-4.8h-4.8'/>` +
  `</g></svg>") 13 13, grab`;

/** Native resize keywords per handle, no rotation applied — a shape rotated
 *  far from axis-aligned gets a slightly imprecise but still directionally
 *  useful cursor rather than a per-angle-generated one. */
export function cursorForHandle(handle: HandleId): string {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
  }
}
