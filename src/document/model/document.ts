import { newId } from './ids';
import {
  DOCUMENT_VERSION,
  type DrawingDocument,
  type DrawingObject,
  type DrawingPage,
  type ObjectId,
  type PageId,
} from './types';

export function createPage(name = 'Page 1'): DrawingPage {
  return { id: newId(), name, objects: [] };
}

export function createDocument(title = 'Untitled'): DrawingDocument {
  const now = Date.now();
  return {
    version: DOCUMENT_VERSION,
    id: newId(),
    title,
    pages: [createPage()],
    createdAt: now,
    updatedAt: now,
  };
}

export function findPage(doc: DrawingDocument, pageId: PageId): DrawingPage | undefined {
  return doc.pages.find((p) => p.id === pageId);
}

export function pageIndex(doc: DrawingDocument, pageId: PageId): number {
  return doc.pages.findIndex((p) => p.id === pageId);
}

/** Next paint order for a page — one above the current top object. */
export function nextZ(page: DrawingPage): number {
  let max = 0;
  for (const o of page.objects) if (o.z > max) max = o.z;
  return max + 1;
}

function replacePage(
  doc: DrawingDocument,
  pageId: PageId,
  fn: (page: DrawingPage) => DrawingPage,
): DrawingDocument {
  const pages = doc.pages.map((p) => (p.id === pageId ? fn(p) : p));
  return { ...doc, pages, updatedAt: Date.now() };
}

export function addObjects(
  doc: DrawingDocument,
  pageId: PageId,
  objects: DrawingObject[],
): DrawingDocument {
  return replacePage(doc, pageId, (page) => ({
    ...page,
    objects: [...page.objects, ...objects],
  }));
}

export function updateObjects(
  doc: DrawingDocument,
  pageId: PageId,
  updated: DrawingObject[],
): DrawingDocument {
  if (updated.length === 0) return doc;
  const byId = new Map(updated.map((o) => [o.id, o]));
  return replacePage(doc, pageId, (page) => ({
    ...page,
    objects: page.objects.map((o) => byId.get(o.id) ?? o),
  }));
}

export function deleteObjects(
  doc: DrawingDocument,
  pageId: PageId,
  ids: ObjectId[],
): DrawingDocument {
  const gone = new Set(ids);
  if (gone.size === 0) return doc;
  return replacePage(doc, pageId, (page) => ({
    ...page,
    objects: page.objects
      .filter((o) => !gone.has(o.id))
      // A deleted shape must not leave connectors bound to a ghost.
      .map((o) => {
        if (o.type !== 'line') return o;
        const startBound = o.startBinding && gone.has(o.startBinding.objectId);
        const endBound = o.endBinding && gone.has(o.endBinding.objectId);
        if (!startBound && !endBound) return o;
        const next = { ...o };
        if (startBound) delete next.startBinding;
        if (endBound) delete next.endBinding;
        return next;
      }),
  }));
}

export function addPage(doc: DrawingDocument, afterIndex: number): DrawingDocument {
  const page = createPage(`Page ${doc.pages.length + 1}`);
  const pages = [...doc.pages];
  pages.splice(afterIndex + 1, 0, page);
  return { ...doc, pages, updatedAt: Date.now() };
}

export function duplicatePage(doc: DrawingDocument, pageId: PageId): DrawingDocument {
  const i = pageIndex(doc, pageId);
  if (i < 0) return doc;
  const source = doc.pages[i];
  const copy: DrawingPage = {
    id: newId(),
    name: `${source.name} copy`,
    // Ids must be regenerated so connector bindings inside the copy stay local.
    objects: remapIds(source.objects),
  };
  const pages = [...doc.pages];
  pages.splice(i + 1, 0, copy);
  return { ...doc, pages, updatedAt: Date.now() };
}

/** Deep-copies objects with fresh ids, rewriting connector bindings to match. */
export function remapIds(objects: DrawingObject[]): DrawingObject[] {
  const map = new Map<ObjectId, ObjectId>();
  for (const o of objects) map.set(o.id, newId());
  return objects.map((o) => {
    const clone = structuredClone(o) as DrawingObject;
    clone.id = map.get(o.id)!;
    if (clone.type === 'line') {
      for (const key of ['startBinding', 'endBinding'] as const) {
        const b = clone[key];
        if (!b) continue;
        const mapped = map.get(b.objectId);
        if (mapped) b.objectId = mapped;
        else delete clone[key];
      }
    }
    return clone;
  });
}

export function deletePage(doc: DrawingDocument, pageId: PageId): DrawingDocument {
  if (doc.pages.length <= 1) return doc;
  return {
    ...doc,
    pages: doc.pages.filter((p) => p.id !== pageId),
    updatedAt: Date.now(),
  };
}

export function renamePage(doc: DrawingDocument, pageId: PageId, name: string): DrawingDocument {
  return replacePage(doc, pageId, (page) => ({ ...page, name }));
}

export function movePage(doc: DrawingDocument, pageId: PageId, toIndex: number): DrawingDocument {
  const from = pageIndex(doc, pageId);
  if (from < 0) return doc;
  const clamped = Math.max(0, Math.min(doc.pages.length - 1, toIndex));
  if (clamped === from) return doc;
  const pages = [...doc.pages];
  const [page] = pages.splice(from, 1);
  pages.splice(clamped, 0, page);
  return { ...doc, pages, updatedAt: Date.now() };
}
