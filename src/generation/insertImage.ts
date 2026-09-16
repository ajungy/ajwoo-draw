import type { EditorStore } from '../app/store';
import type { Rect } from '../document/model/types';
import { addObjects, nextZ } from '../document/model/document';
import { newId } from '../document/model/ids';
import { drawingImage, validImageSource } from '../canvas/renderer/images';

/** Insert beside the captured reference on its original page, even if the user switches pages. */
export async function insertGeneratedImage(store: EditorStore, src: string, alt: string, documentId: string, pageId: string, bounds: Rect, signal?: AbortSignal) {
  if (!validImageSource(src)) throw new Error('The provider returned an invalid image.');
  const image = drawingImage(src);
  await image.decode();
  signal?.throwIfAborted();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Could not read the generated image.');
  if (store.doc.id !== documentId) throw new Error('The drawing changed. Download the generated image from the preview.');
  const page = store.doc.pages.find(p => p.id === pageId);
  if (!page) throw new Error('The original page was deleted. Download the generated image from the preview.');
  const width = Math.max(120, Math.min(1024, bounds.w));
  const object = { id: newId(), type: 'image' as const, z: nextZ(page), src, alt,
    frame: { x: bounds.x + bounds.w + 32, y: bounds.y, w: width, h: width * image.naturalHeight / image.naturalWidth } };
  store.transaction(doc => addObjects(doc, pageId, [object]));
  if (store.currentPageId === pageId) { store.setTool('select'); store.setSelection([object.id]); }
  return object;
}
