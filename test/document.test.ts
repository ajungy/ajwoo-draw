import { describe, expect, it } from 'vitest';
import {
  addObjects,
  addPage,
  createDocument,
  deleteObjects,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
} from '../src/document/model/document';
import { deserializeDocument, serializeDocument } from '../src/document/serialization/schema';
import { line, pen, shape } from './factories';

describe('document', () => {
  it('starts with one page and a stable identity', () => {
    const doc = createDocument();
    expect(doc.pages).toHaveLength(1);
    expect(doc.id).toBeTruthy();
    expect(doc.pages[0].objects).toEqual([]);
  });

  it('adds a page after the current one', () => {
    const doc = addPage(createDocument(), 0);
    expect(doc.pages).toHaveLength(2);
    expect(new Set(doc.pages.map((p) => p.id)).size).toBe(2);
  });

  it('refuses to delete the last page', () => {
    const doc = createDocument();
    expect(deletePage(doc, doc.pages[0].id).pages).toHaveLength(1);
  });

  it('deletes a page when others remain', () => {
    const doc = addPage(createDocument(), 0);
    expect(deletePage(doc, doc.pages[0].id).pages).toHaveLength(1);
  });

  it('duplicates a page with fresh ids and locally rewired connectors', () => {
    const box = shape();
    const connector = line({ endBinding: { objectId: box.id, anchor: 'left' } });
    let doc = createDocument();
    doc = addObjects(doc, doc.pages[0].id, [box, connector]);
    doc = duplicatePage(doc, doc.pages[0].id);

    const copy = doc.pages[1];
    const copiedShape = copy.objects.find((o) => o.type === 'shape')!;
    const copiedLine = copy.objects.find((o) => o.type === 'line')!;
    expect(copiedShape.id).not.toBe(box.id);
    // The binding must follow the copy, not reach back into the original page.
    expect(copiedLine.type === 'line' && copiedLine.endBinding?.objectId).toBe(copiedShape.id);
  });

  it('renames and reorders pages', () => {
    let doc = addPage(createDocument(), 0);
    doc = renamePage(doc, doc.pages[1].id, 'Flow');
    const moved = movePage(doc, doc.pages[1].id, 0);
    expect(moved.pages[0].name).toBe('Flow');
  });

  it('unbinds connectors when their shape is deleted', () => {
    const box = shape();
    const connector = line({ endBinding: { objectId: box.id, anchor: 'top' } });
    let doc = createDocument();
    doc = addObjects(doc, doc.pages[0].id, [box, connector]);
    doc = deleteObjects(doc, doc.pages[0].id, [box.id]);
    const remaining = doc.pages[0].objects[0];
    expect(remaining.type === 'line' && remaining.endBinding).toBeUndefined();
  });

  it('round-trips through serialization without losing anything', () => {
    let doc = createDocument('Sketch');
    doc = addObjects(doc, doc.pages[0].id, [pen(), shape({ text: 'User Login' }), line()]);
    const restored = deserializeDocument(serializeDocument(doc));
    expect(restored.title).toBe('Sketch');
    expect(restored.pages[0].objects).toHaveLength(3);
    expect(restored.pages[0].objects[1]).toMatchObject({ type: 'shape', text: 'User Login' });
  });
});
