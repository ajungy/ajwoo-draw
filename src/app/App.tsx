import { useCallback, useEffect, useRef, useState } from 'react';
import { CanvasView } from '../canvas/CanvasView';
import type { CanvasController } from '../canvas/interaction/controller';
import { CanvasDescription } from '../components/CanvasDescription';
import { ContextBar } from '../components/ContextBar';
import { Header, type HeaderActions } from '../components/Header';
import { TextEditorOverlay } from '../components/TextEditorOverlay';
import { Toolbar } from '../components/Toolbar';
import { boundsOfObjects } from '../document/model/objects';
import { createDocument } from '../document/model/document';
import { clamp } from '../geometry';
import { MAX_ZOOM, MIN_ZOOM } from '../document/model/types';
import { clearSession } from '../storage/indexeddb/db';
import { Dialog } from '../ui/Dialog';
import { Toast, type ToastMessage } from '../ui/Toast';
import * as actions from './actions';
import { useAutosave } from './persistence';
import { useShortcuts } from './shortcuts';
import { useEditor } from './useStore';

interface AppProps {
  /** False when the document came from a share link, which must not overwrite the local one. */
  autosave: boolean;
  /** Set when the app opened a share link, so the banner can explain what happened. */
  openedFromLink: boolean;
  startupError: string | null;
}

export function App({ autosave, openedFromLink, startupError }: AppProps) {
  const store = useEditor();
  const controllerRef = useRef<CanvasController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The canvas viewport itself — not the whole shell, which also includes the
  // header and the contextual/tool bars. Fitting or centring against the full
  // shell was cropping content under that chrome; the stage is what's actually
  // visible as drawing surface.
  const stageRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirm, setConfirm] = useState<null | 'reset' | 'page'>(null);
  /**
   * A drawing opened from a link is not saved locally, because doing so would
   * silently replace whatever the recipient already had. They can adopt it, and
   * the banner below makes sure they know the choice exists.
   */
  const [saveLocally, setSaveLocally] = useState(autosave);
  const toastId = useRef(0);

  useAutosave(store, saveLocally);

  const report = useCallback((result: actions.ActionResult) => {
    if (result.text === '') return;
    toastId.current += 1;
    setToast({ id: toastId.current, ...result });
  }, []);

  const runAction = useCallback(
    (fn: () => Promise<actions.ActionResult>) => () => {
      void fn().then(report);
    },
    [report],
  );

  /* -------------------------------------------------------------- camera -- */

  const fitToDrawing = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const bounds = boundsOfObjects(store.page.objects);
    if (!bounds || bounds.w === 0 || bounds.h === 0) {
      store.setCamera({ x: -rect.width / 2, y: -rect.height / 2, zoom: 1 });
      return;
    }
    const padding = 48;
    const zoom = clamp(
      Math.min((rect.width - padding * 2) / bounds.w, (rect.height - padding * 2) / bounds.h),
      MIN_ZOOM,
      Math.min(MAX_ZOOM, 2),
    );
    store.setCamera({
      x: bounds.x + bounds.w / 2 - rect.width / 2 / zoom,
      y: bounds.y + bounds.h / 2 - rect.height / 2 / zoom,
      zoom,
    });
  }, [store]);

  const zoomAtCenter = useCallback(
    (nextZoom: number) => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      store.setCamera({
        x: store.camera.x + cx / store.camera.zoom - cx / zoom,
        y: store.camera.y + cy / store.camera.zoom - cy / zoom,
        zoom,
      });
    },
    [store],
  );

  const zoomBy = useCallback((factor: number) => zoomAtCenter(store.camera.zoom * factor), [store, zoomAtCenter]);
  const resetZoom = useCallback(() => zoomAtCenter(1), [zoomAtCenter]);

  useShortcuts(store, controllerRef, fitToDrawing);

  // Centre the empty canvas on first paint so the origin is under the viewport.
  // Every new document starts at 100% zoom; only Fit or a deliberate zoom
  // changes that.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    store.setCamera({ x: -rect.width / 2, y: -rect.height / 2, zoom: 1 });
    if (openedFromLink) fitToDrawing();
    // Intentionally first-mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (startupError) {
      report({ text: startupError, tone: 'danger' });
      return;
    }
    if (!openedFromLink) return;
    report({
      text: 'Opened from a link. This drawing is not saved on this device yet.',
      tone: 'neutral',
      action: {
        label: 'Save here',
        run: () => {
          setSaveLocally(true);
          setToast(null);
        },
      },
    });
  }, [startupError, openedFromLink, report]);

  /* ------------------------------------------------------------- clipboard -- */

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (store.clipboard.length > 0) store.pasteClipboard();
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [store]);

  const headerActions: HeaderActions = {
    share: runAction(() => actions.shareDrawing(store, () => void actions.exportSvg(store).then(report))),
    exportSvg: runAction(() => actions.exportSvg(store)),
    exportPng: runAction(() => actions.exportPng(store)),
    exportJson: runAction(() => actions.exportJson(store)),
    copySvg: runAction(() => actions.copySvg(store)),
    copyPng: runAction(() => actions.copyPng(store)),
    sharePng: runAction(() => actions.sharePng(store)),
    resetDrawing: () => setConfirm('reset'),
    openFile: () => fileRef.current?.click(),
    fitToDrawing,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(0.8),
    resetZoom,
    deletePage: () => setConfirm('page'),
  };

  return (
    <div className="shell">
      <Header actions={headerActions} />
      <ContextBar />

      <main className="stage" ref={stageRef}>
        <CanvasDescription />
        <CanvasView
          controllerRef={controllerRef}
          onRequestTextEdit={(id) => store.setEditingText(id)}
        />
        <TextEditorOverlay />
      </main>

      {/* Only visible when the header has no room for the toolbar. */}
      <div className="controls">
        <Toolbar />
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <Dialog
        open={confirm === 'reset'}
        title="Reset this drawing?"
        description="Everything on every page will be cleared and cannot be recovered — this drawing is saved on this device, so export it first if you want to keep it."
        confirmLabel="Reset drawing"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void clearSession().catch(() => undefined);
          store.replaceDocument(createDocument());
          fitToDrawing();
        }}
      />
      <Dialog
        open={confirm === 'page'}
        title={`Delete ${store.page.name}?`}
        description="Everything drawn on this page will be removed. You can undo this."
        confirmLabel="Delete page"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          store.deleteCurrentPage();
        }}
      />

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void actions.importFile(store, file).then(report);
        }}
      />
    </div>
  );
}
