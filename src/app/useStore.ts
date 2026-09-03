import { createContext, useContext, useSyncExternalStore } from 'react';
import type { EditorStore } from './store';

export const StoreContext = createContext<EditorStore | null>(null);

export function useStore(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside a StoreProvider.');
  return store;
}

/**
 * Subscribes a component to app-level store changes. Camera moves and in-flight
 * strokes deliberately do not bump this version, so pointer movement never
 * rerenders the React tree.
 */
export function useEditor(): EditorStore {
  const store = useStore();
  useSyncExternalStore(store.subscribeApp, store.getAppVersion, store.getAppVersion);
  return store;
}
