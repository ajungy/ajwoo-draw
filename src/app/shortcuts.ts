import { useEffect } from 'react';
import type { CanvasController } from '../canvas/interaction/controller';
import type { EditorStore } from './store';
import type { ToolId } from '../document/model/types';

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select',
  h: 'hand',
  p: 'pen',
  l: 'line',
  s: 'shape',
  t: 'text',
};

/** True when focus is in a field, where a bare letter is text, not a shortcut. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable === true
  );
}

export function useShortcuts(
  store: EditorStore,
  controllerRef: React.MutableRefObject<CanvasController | null>,
  onFit: () => void,
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !typing(e.target)) {
        controllerRef.current?.setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      if (typing(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          store.redo();
          return;
        }
        if (key === 'c') {
          store.copySelection();
          return;
        }
        if (key === 'v') {
          store.pasteClipboard();
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          store.duplicateSelection();
          return;
        }
        if (key === 'a') {
          e.preventDefault();
          store.selectAll();
          return;
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selection.length > 0) {
          e.preventDefault();
          store.deleteSelection();
        }
        return;
      }
      if (e.key === 'Escape') {
        store.setSelection([]);
        return;
      }
      if (e.key === '1' && e.shiftKey) {
        onFit();
        return;
      }
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) store.setTool(tool);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') controllerRef.current?.setSpaceHeld(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [store, controllerRef, onFit]);
}
