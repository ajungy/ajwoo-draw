import type { DrawingObject } from '../../document/model/types';

export function validImageSource(src: unknown): src is string {
  return typeof src === 'string' && src.length <= 32_000_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src);
}
const cache = new Map<string, HTMLImageElement>();
export function drawingImage(src: string): HTMLImageElement {
  let image = cache.get(src);
  if (!image) {
    image = new Image();
    image.onload = () => window.dispatchEvent(new Event('drawing-image-loaded'));
    image.src = validImageSource(src) ? src : '';
    cache.set(src, image);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return image;
}
export async function loadDrawingImages(objects: DrawingObject[]): Promise<void> {
  await Promise.all(objects.filter(o => o.type === 'image').map(o => drawingImage(o.src).decode()));
}
