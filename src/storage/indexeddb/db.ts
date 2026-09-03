import type { DrawingDocument } from '../../document/model/types';
import { parseDocument } from '../../document/serialization/schema';
import type { StyleState } from '../../app/style';

const DB_NAME = 'ajwoo-draw';
const DB_VERSION = 1;
const DOCS = 'documents';
const CURRENT_KEY = 'current';

/** Everything needed to bring a session back exactly as it was left. */
export interface StoredSession {
  document: DrawingDocument;
  currentPageId: string;
  style: StyleState;
  showGrid: boolean;
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open local storage.'));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(DOCS, mode);
        const req = fn(t.objectStore(DOCS));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Local storage request failed.'));
        t.oncomplete = () => db.close();
      }),
  );
}

export async function saveSession(session: StoredSession): Promise<void> {
  // The model is plain data by construction, so structured clone accepts it
  // directly — no serialization step on the hot path.
  await tx('readwrite', (s) => s.put(session, CURRENT_KEY));
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await tx<StoredSession | undefined>('readonly', (s) => s.get(CURRENT_KEY));
  if (!raw || typeof raw !== 'object') return null;
  // Stored data is still untrusted: a partial write or an older build could
  // leave something the current model cannot render.
  const document = parseDocument(raw.document);
  const currentPageId = document.pages.some((p) => p.id === raw.currentPageId)
    ? raw.currentPageId
    : document.pages[0].id;
  return {
    document,
    currentPageId,
    style: raw.style,
    showGrid: Boolean(raw.showGrid),
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : Date.now(),
  };
}

export async function clearSession(): Promise<void> {
  await tx('readwrite', (s) => s.delete(CURRENT_KEY));
}
