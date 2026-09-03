import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { EditorStore } from './app/store';
import { StoreContext } from './app/useStore';
import { DEFAULT_STYLE } from './app/style';
import { createDocument } from './document/model/document';
import { loadSession } from './storage/indexeddb/db';
import { decodeDocument, readShareFragment } from './sharing/shareLink';
import './styles/tokens.css';
import './styles/app.css';

/**
 * Startup order matters:
 *  1. A share link in the fragment wins — someone followed a link to see a
 *     drawing, so that is what must appear, and autosave stays off until they
 *     make it their own.
 *  2. Otherwise restore the local session.
 *  3. Otherwise a blank canvas, immediately.
 */
async function boot() {
  const store = new EditorStore(createDocument());
  let autosave = true;
  let openedFromLink = false;
  let startupError: string | null = null;

  const fragment = readShareFragment(location.hash);
  if (fragment) {
    try {
      const doc = await decodeDocument(fragment);
      store.replaceDocument(doc);
      openedFromLink = true;
      autosave = false;
      // Drop the payload from the address bar: it is enormous, and leaving it
      // there makes every later share link compound.
      history.replaceState(null, '', location.pathname + location.search);
    } catch (error) {
      startupError = error instanceof Error ? error.message : 'That share link could not be opened.';
    }
  }

  if (!openedFromLink) {
    try {
      const session = await loadSession();
      if (session) {
        store.replaceDocument(session.document, session.currentPageId);
        store.style = { ...DEFAULT_STYLE, ...session.style };
        store.showGrid = session.showGrid;
      }
    } catch (error) {
      startupError =
        error instanceof Error && error.name === 'InvalidDocumentError'
          ? 'The saved drawing could not be read, so a blank canvas was opened.'
          : 'Local save is unavailable. Your drawing can still be exported manually.';
      store.setSaveStatus('error');
    }
  }

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');
  createRoot(root).render(
    <StrictMode>
      <StoreContext.Provider value={store}>
        <App autosave={autosave} openedFromLink={openedFromLink} startupError={startupError} />
      </StoreContext.Provider>
    </StrictMode>,
  );

}

void boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is an enhancement; failing to register must not break the app.
    });
  });
}
