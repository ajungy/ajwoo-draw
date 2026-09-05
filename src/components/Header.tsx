import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useEditor, useStore } from '../app/useStore';
import type { EditorStore } from '../app/store';
import { IconButton } from '../ui/IconButton';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { Icon } from '../ui/Icon';
import { Toolbar } from './Toolbar';

export interface HeaderActions {
  share: () => void;
  exportSvg: () => void;
  exportPng: () => void;
  exportJson: () => void;
  copySvg: () => void;
  copyPng: () => void;
  sharePng: () => void;
  resetDrawing: () => void;
  openFile: () => void;
  fitToDrawing: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  deletePage: () => void;
}

/** One offscreen canvas, reused for every measurement rather than allocated
 *  per keystroke — measuring text width is the one thing a canvas 2D context
 *  does without touching layout at all. */
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 0;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

export function Header({ actions }: { actions: HeaderActions }) {
  const store = useEditor();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const pageCount = store.doc.pages.length;

  // Sized to the pixel width of its own text — an input's character-count
  // `size` only approximates that for a proportional font, leaving a sliver
  // of unused space after most titles. Re-measured on every change, plus
  // once after the title font is actually available (a late-loading webfont
  // can widen or narrow it after the first paint).
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const resize = () => {
      const cs = getComputedStyle(el);
      // `box-sizing: border-box` makes the input's own padding eat into
      // whatever width is set here, so it has to be added back — otherwise
      // the box comes out narrower than the text it's meant to fit and the
      // last character or two get clipped under the ellipsis.
      const horizontalChrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      // A few pixels of slack: room for the caret after the last character,
      // and cover for canvas measureText() running a couple of px narrower
      // than the DOM's own text layout for the same string/font — without
      // it, the box comes out juuust short and clips a letter under the
      // ellipsis.
      const width = Math.max(24, textWidth(store.doc.title, cs.font) + horizontalChrome + 6);
      el.style.width = `${width}px`;
    };
    resize();
    // The very first measurement can land before the title's own webfont has
    // finished loading, using the fallback face's (usually narrower) metrics
    // — this re-measures once the real font is actually in, so the box
    // doesn't stay a hair too narrow and clip the last character or two.
    document.fonts?.ready.then(resize);
  }, [store.doc.title]);

  return (
    <header className="header">
      <div className="header__left">
        <span className="logo" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M7 15.5c2.2-6 4.2-6.6 5-3.5.9 3.2 2.6 2.6 5-2.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <input
          ref={titleRef}
          className="title-input"
          aria-label="Drawing name"
          value={store.doc.title}
          onChange={(e) => store.setTitle(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' || e.key === 'Escape') titleRef.current?.blur();
          }}
        />

        <div className="header__pages">
          <div className="page-indicator">
            <button
              type="button"
              className="page-indicator__button"
              aria-label={`Page ${store.pageNumber} of ${pageCount}. Manage pages`}
              aria-expanded={pagesOpen}
              aria-haspopup="menu"
              onClick={() => setPagesOpen((v) => !v)}
            >
              {store.pageNumber} / {pageCount}
            </button>
            <Menu open={pagesOpen} onClose={() => setPagesOpen(false)} label="Pages" align="left">
              {store.doc.pages.map((page, i) => (
                <MenuItem
                  key={page.id}
                  onSelect={() => {
                    store.setPage(page.id);
                    setPagesOpen(false);
                  }}
                >
                  {i + 1}. {page.name}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                onSelect={() => {
                  store.addPage();
                  setPagesOpen(false);
                }}
              >
                Add page
              </MenuItem>
              <MenuItem
                onSelect={() => {
                  store.duplicateCurrentPage();
                  setPagesOpen(false);
                }}
              >
                Duplicate page
              </MenuItem>
              <MenuItem
                tone="danger"
                disabled={pageCount === 1}
                onSelect={() => {
                  setPagesOpen(false);
                  actions.deletePage();
                }}
              >
                Delete page
              </MenuItem>
            </Menu>
          </div>
        </div>
      </div>

      <Toolbar inHeader />

      <div className="header__actions">
        <IconButton icon="undo" label="Undo" size="sm" disabled={!store.canUndo} onClick={() => store.undo()} />
        <IconButton icon="redo" label="Redo" size="sm" disabled={!store.canRedo} onClick={() => store.redo()} />
        <div className="header__zoom">
          <IconButton icon="zoom-out" label="Zoom out" size="sm" onClick={actions.zoomOut} />
          <ZoomLabel onReset={actions.resetZoom} />
          <IconButton icon="zoom-in" label="Zoom in" size="sm" onClick={actions.zoomIn} />
        </div>
        <div className="menu-anchor">
          <IconButton
            icon="more"
            label="More actions"
            size="sm"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
          />
          <Menu open={menuOpen} onClose={() => setMenuOpen(false)} label="More actions">
            <SaveStatus />
            <MenuSeparator />
            <MenuItem onSelect={() => run(setMenuOpen, actions.share)}>Share link</MenuItem>
            <MenuItem onSelect={() => run(setMenuOpen, actions.copySvg)}>Copy SVG</MenuItem>
            <MenuItem onSelect={() => run(setMenuOpen, actions.copyPng)}>Copy PNG</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => run(setMenuOpen, actions.exportSvg)}>Download SVG</MenuItem>
            <MenuItem onSelect={() => run(setMenuOpen, actions.exportPng)}>Download PNG</MenuItem>
            <MenuItem onSelect={() => run(setMenuOpen, actions.sharePng)}>Share image…</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => run(setMenuOpen, actions.fitToDrawing)} hint="Shift 1">
              Fit to drawing
            </MenuItem>
            <MenuItem onSelect={() => run(setMenuOpen, () => store.toggleGrid())}>
              {store.showGrid ? 'Hide grid' : 'Show grid'}
            </MenuItem>
            <MenuItem
              onSelect={() => store.toggleScrappy()}
              hint={store.scrappy ? 'On' : 'Off'}
            >
              Scrappy
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => run(setMenuOpen, actions.openFile)}>Open draw file…</MenuItem>
            <MenuItem onSelect={() => run(setMenuOpen, actions.exportJson)}>Download draw file</MenuItem>
            <MenuSeparator />
            <MenuItem tone="danger" onSelect={() => run(setMenuOpen, actions.resetDrawing)}>
              Reset drawing
            </MenuItem>
          </Menu>
        </div>
      </div>
    </header>
  );
}

function run(close: (v: boolean) => void, fn: () => void): void {
  close(false);
  fn();
}

/**
 * The live zoom percentage. Camera changes are render-only (they must not
 * rerender the whole app on every pan), so this reads the camera through the
 * render-notification channel directly rather than the app-level store hook —
 * the one place in the header that needs to update at pan/zoom frequency.
 */
function useCameraZoom(store: EditorStore): number {
  return useSyncExternalStore(
    store.subscribeRender,
    () => store.camera.zoom,
    () => store.camera.zoom,
  );
}

function ZoomLabel({ onReset }: { onReset: () => void }) {
  const store = useStore();
  const zoom = useCameraZoom(store);
  const percent = Math.round(zoom * 100);
  return (
    <button
      type="button"
      className="zoom-label"
      onClick={onReset}
      aria-label={`Zoom ${percent} percent. Reset to 100%.`}
      title="Reset zoom to 100%"
    >
      {percent}%
    </button>
  );
}

/**
 * The save state as the first line of the overflow menu. Quiet, but never
 * hidden: a person who wonders whether their drawing is safe should not have
 * to guess, only open the one menu that holds everything else.
 */
function SaveStatus() {
  const store = useEditor();
  if (store.saveStatus === 'idle') return null;
  if (store.saveStatus === 'error') {
    return (
      <div className="menu-status menu-status--error" role="status">
        <Icon name="close" size={16} />
        Local save unavailable — export to keep this drawing
      </div>
    );
  }
  if (store.saveStatus === 'saving') {
    return (
      <div className="menu-status" role="status">
        Saving…
      </div>
    );
  }
  return (
    <div className="menu-status menu-status--saved" role="status">
      <Icon name="check" size={16} />
      Saved
    </div>
  );
}
