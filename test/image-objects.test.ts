import { EditorStore } from '../src/app/store';
import { deserializeDocument, serializeDocument } from '../src/document/serialization/schema';
import { hitTest, scaleObjectInto, translateObject } from '../src/document/model/objects';
import { exportPageToSvg } from '../src/export/svg/exportSvg';
import { insertGeneratedImage } from '../src/generation/insertImage';
import type { ImageObject } from '../src/document/model/types';

const image: ImageObject = { id: 'image', type: 'image', z: 1, src: 'data:image/png;base64,aW1hZ2U=', alt: 'Generated UI', frame: { x: 10, y: 20, w: 200, h: 400 } };
afterEach(() => vi.unstubAllGlobals());

it('round-trips embedded images, duplicates, and undoes them', () => {
  const store = new EditorStore(); store.addObject(image, { select: true });
  expect(deserializeDocument(serializeDocument(store.doc)).pages[0].objects).toEqual([image]);
  store.duplicateSelection(); expect(store.page.objects).toHaveLength(2);
  store.undo(); expect(store.page.objects).toEqual([image]);
});
it('moves, resizes, and selects raster images', () => {
  expect(hitTest(image, { x: 100, y: 200 }, 0)).toBe(true);
  expect(translateObject(image, 20, 30)).toMatchObject({ frame: { x: 30, y: 50 } });
  expect(scaleObjectInto(image, image.frame, { x: 0, y: 0, w: 100, h: 200 })).toMatchObject({ frame: { w: 100, h: 200 } });
});
it('exports embedded images and rejects remote or executable image sources on import', () => {
  const store = new EditorStore(); store.addObject(image);
  expect(exportPageToSvg(store.page)).toContain(`href="${image.src}"`);
  for (const src of ['https://example.com/track.png', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    const doc = structuredClone(store.doc); (doc.pages[0].objects[0] as ImageObject).src = src;
    expect(deserializeDocument(JSON.stringify(doc)).pages[0].objects).toHaveLength(0);
  }
});
it('keeps asynchronous generation on its original page', async () => {
  vi.stubGlobal('Image', class { src = ''; naturalWidth = 512; naturalHeight = 512; decode() { return Promise.resolve(); } });
  const store = new EditorStore(); const pageId = store.page.id;
  store.setPage(store.doc.pages[1].id);
  await insertGeneratedImage(store, image.src, image.alt, store.doc.id, pageId, image.frame);
  expect(store.page.objects).toHaveLength(0);
  expect(store.doc.pages[0].objects[0]).toMatchObject({ type: 'image' });
});
