import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, loadSession, saveSession } from '../src/storage/indexeddb/db';
import { addObjects, createDocument } from '../src/document/model/document';
import { DEFAULT_STYLE } from '../src/app/style';
import { shape } from './factories';

describe('local persistence', () => {
  beforeEach(async () => {
    await clearSession();
  });

  it('returns null when nothing has been saved', async () => {
    expect(await loadSession()).toBeNull();
  });

  it('saves and restores a document', async () => {
    let doc = createDocument('Napkin');
    doc = addObjects(doc, doc.pages[0].id, [shape({ text: 'User Login' })]);
    await saveSession({
      document: doc,
      currentPageId: doc.pages[0].id,
      style: DEFAULT_STYLE,
      showGrid: true,
      savedAt: Date.now(),
    });

    const restored = await loadSession();
    expect(restored?.document.title).toBe('Napkin');
    expect(restored?.showGrid).toBe(true);
    expect(restored?.document.pages[0].objects[0]).toMatchObject({ text: 'User Login' });
  });

  it('falls back to the first page when the saved page is gone', async () => {
    const doc = createDocument();
    await saveSession({
      document: doc,
      currentPageId: 'a-page-that-was-deleted',
      style: DEFAULT_STYLE,
      showGrid: false,
      savedAt: Date.now(),
    });
    const restored = await loadSession();
    expect(restored?.currentPageId).toBe(doc.pages[0].id);
  });
});
