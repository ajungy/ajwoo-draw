import { useEffect, useRef } from 'react';
import { saveSession } from '../storage/indexeddb/db';
import type { EditorStore } from './store';

const DEBOUNCE_MS = 600;

/**
 * Autosaves to IndexedDB whenever the document settles, and once more on
 * pagehide so a drawing survives a tab being closed mid-stroke.
 *
 * A failed save is surfaced through `saveStatus` rather than swallowed — the
 * user needs to know their work is only in memory so they can export it.
 */
export function useAutosave(store: EditorStore, enabled: boolean): void {
  const timer = useRef<number | null>(null);
  const lastSaved = useRef<unknown>(null);

  useEffect(() => {
    if (!enabled) return;

    const write = async () => {
      const doc = store.doc;
      if (doc === lastSaved.current) return;
      store.setSaveStatus('saving');
      try {
        await saveSession({
          document: doc,
          currentPageId: store.currentPageId,
          style: store.style,
          showGrid: store.showGrid,
          scrappy: store.scrappy,
          savedAt: Date.now(),
        });
        lastSaved.current = doc;
        store.setSaveStatus('saved');
      } catch {
        store.setSaveStatus('error');
      }
    };

    const schedule = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = window.setTimeout(write, DEBOUNCE_MS);
    };

    const unsubscribe = store.subscribeApp(schedule);
    const flush = () => void write();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    schedule();

    return () => {
      unsubscribe();
      if (timer.current !== null) clearTimeout(timer.current);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [store, enabled]);
}
