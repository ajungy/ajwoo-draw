import { History } from '../document/history/history';
import {
  addObjects,
  addPage as addPageOp,
  createDocument,
  deleteObjects,
  deletePage as deletePageOp,
  duplicatePage as duplicatePageOp,
  movePage as movePageOp,
  nextZ,
  pageIndex,
  remapIds,
  renamePage as renamePageOp,
  updateObjects,
} from '../document/model/document';
import { boundsOfObjects, translateObject } from '../document/model/objects';
import type {
  Camera,
  DrawingDocument,
  DrawingObject,
  DrawingPage,
  ObjectId,
  Point,
  Rect,
  ToolId,
} from '../document/model/types';
import { DEFAULT_STYLE, type StyleState } from './style';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Ephemeral state that changes at pointer frequency. It never reaches React —
 * mutating it only invalidates the canvas — so a stroke in progress costs one
 * repaint per frame and zero component renders.
 */
export interface EphemeralState {
  /** The object being drawn right now, painted on top of the committed page. */
  draft: DrawingObject | null;
  /** Rubber-band selection rectangle in world coordinates. */
  marquee: Rect | null;
  /** Snap target highlight: the shape a connector would attach to. */
  snapObjectId: ObjectId | null;
  snapPoint: Point | null;
}

type Listener = () => void;

export class EditorStore {
  private history: History;
  private appListeners = new Set<Listener>();
  private renderListeners = new Set<Listener>();
  /** Bumped for every change React can observe; the useSyncExternalStore snapshot. */
  private appVersion = 0;

  camera: Camera = { x: -400, y: -300, zoom: 1 };
  tool: ToolId = 'pen';
  style: StyleState = { ...DEFAULT_STYLE };
  selection: ObjectId[] = [];
  editingTextId: ObjectId | null = null;
  currentPageId: string;
  saveStatus: SaveStatus = 'idle';
  /** A dotted grid is the default surface texture; the user can turn it off. */
  showGrid = true;
  /** Whole-canvas visual mode: every straight edge renders hand-drawn and
   *  wobbly, and text switches to a handwritten face. A rendering choice, not
   *  a document one — it never touches stored object data. */
  scrappy = false;
  /** Objects held for paste. Kept in the app so paste works without clipboard permission. */
  clipboard: DrawingObject[] = [];

  ephemeral: EphemeralState = { draft: null, marquee: null, snapObjectId: null, snapPoint: null };

  constructor(doc: DrawingDocument = createDocument()) {
    this.history = new History(doc);
    this.currentPageId = doc.pages[0].id;
  }

  /* ------------------------------------------------------------ plumbing -- */

  subscribeApp = (fn: Listener): (() => void) => {
    this.appListeners.add(fn);
    return () => this.appListeners.delete(fn);
  };

  subscribeRender = (fn: Listener): (() => void) => {
    this.renderListeners.add(fn);
    return () => this.renderListeners.delete(fn);
  };

  getAppVersion = (): number => this.appVersion;

  /** Repaint the canvas without touching React. */
  invalidate(): void {
    for (const fn of this.renderListeners) fn();
  }

  private notify(): void {
    this.appVersion++;
    for (const fn of this.appListeners) fn();
    this.invalidate();
  }

  /* ------------------------------------------------------------ document -- */

  get doc(): DrawingDocument {
    return this.history.current;
  }

  get page(): DrawingPage {
    return this.doc.pages.find((p) => p.id === this.currentPageId) ?? this.doc.pages[0];
  }

  get pageNumber(): number {
    return Math.max(0, pageIndex(this.doc, this.currentPageId)) + 1;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  objectById(id: ObjectId): DrawingObject | undefined {
    return this.page.objects.find((o) => o.id === id);
  }

  selectedObjects(): DrawingObject[] {
    const ids = new Set(this.selection);
    return this.page.objects.filter((o) => ids.has(o.id));
  }

  /**
   * The one write path. `commit: false` amends the newest history entry instead
   * of adding a step, which is how a live drag stays a single undo.
   */
  private apply(next: DrawingDocument, commit = true): void {
    if (next === this.doc) return;
    if (commit) this.history.push(next);
    else this.history.amend(next);
    this.notify();
  }

  transaction(fn: (doc: DrawingDocument) => DrawingDocument, commit = true): void {
    this.apply(fn(this.doc), commit);
  }

  replaceDocument(doc: DrawingDocument, pageId = doc.pages[0].id): void {
    this.history.reset(doc);
    this.currentPageId = pageId;
    this.selection = [];
    this.editingTextId = null;
    this.notify();
  }

  /* -------------------------------------------------------------- objects -- */

  addObject(object: DrawingObject, opts: { select?: boolean } = {}): void {
    this.apply(addObjects(this.doc, this.currentPageId, [object]));
    if (opts.select) this.setSelection([object.id]);
  }

  updateObject(object: DrawingObject, commit = true): void {
    this.apply(updateObjects(this.doc, this.currentPageId, [object]), commit);
  }

  updateMany(objects: DrawingObject[], commit = true): void {
    this.apply(updateObjects(this.doc, this.currentPageId, objects), commit);
  }

  deleteSelection(): void {
    if (this.selection.length === 0) return;
    this.apply(deleteObjects(this.doc, this.currentPageId, this.selection));
    this.setSelection([]);
  }

  duplicateSelection(): void {
    const originals = this.selectedObjects();
    if (originals.length === 0) return;
    const base = nextZ(this.page);
    const copies = remapIds(originals).map((o, i) =>
      Object.assign(translateObject(o, 16, 16), { z: base + i }),
    );
    this.apply(addObjects(this.doc, this.currentPageId, copies));
    this.setSelection(copies.map((o) => o.id));
  }

  copySelection(): void {
    const objects = this.selectedObjects();
    if (objects.length > 0) this.clipboard = structuredClone(objects);
  }

  /** Pastes the internal clipboard, centred on `at` when given. */
  pasteClipboard(at?: Point): void {
    if (this.clipboard.length === 0) return;
    const base = nextZ(this.page);
    let copies = remapIds(this.clipboard).map((o, i) => ({ ...o, z: base + i }));
    const bounds = boundsOfObjects(copies);
    if (at && bounds) {
      const dx = at.x - (bounds.x + bounds.w / 2);
      const dy = at.y - (bounds.y + bounds.h / 2);
      copies = copies.map((o) => translateObject(o, dx, dy));
    } else {
      copies = copies.map((o) => translateObject(o, 16, 16));
    }
    this.apply(addObjects(this.doc, this.currentPageId, copies));
    this.setSelection(copies.map((o) => o.id));
  }

  /* ------------------------------------------------------------ selection -- */

  setSelection(ids: ObjectId[]): void {
    const same = ids.length === this.selection.length && ids.every((id, i) => id === this.selection[i]);
    if (same) return;
    this.selection = ids;
    if (this.editingTextId && !ids.includes(this.editingTextId)) this.editingTextId = null;
    this.notify();
  }

  selectAll(): void {
    this.setSelection(this.page.objects.map((o) => o.id));
  }

  setEditingText(id: ObjectId | null): void {
    if (this.editingTextId === id) return;
    this.editingTextId = id;
    this.notify();
  }

  /* ----------------------------------------------------------------- tool -- */

  setTool(tool: ToolId): void {
    if (this.tool === tool) return;
    this.tool = tool;
    if (tool !== 'select') {
      this.editingTextId = null;
      // Selection — and the bounding box that comes with it — belongs to the
      // Select tool alone. Switching to Pen, Shape, and so on always starts
      // from a clean canvas, never with a leftover box around something the
      // new tool has nothing to do with.
      this.selection = [];
    }
    this.notify();
  }

  setStyle(patch: Partial<StyleState>): void {
    this.style = { ...this.style, ...patch };
    this.notify();
  }

  setSaveStatus(status: SaveStatus): void {
    if (this.saveStatus === status) return;
    this.saveStatus = status;
    this.notify();
  }

  toggleGrid(): void {
    this.showGrid = !this.showGrid;
    this.notify();
  }

  toggleScrappy(): void {
    this.scrappy = !this.scrappy;
    this.notify();
  }

  /* --------------------------------------------------------------- camera -- */

  setCamera(camera: Camera): void {
    this.camera = camera;
    // Camera is render-only state: panning must not rerender the app.
    this.invalidate();
  }

  /* ---------------------------------------------------------------- pages -- */

  setPage(pageId: string): void {
    if (this.currentPageId === pageId) return;
    this.currentPageId = pageId;
    this.selection = [];
    this.editingTextId = null;
    this.notify();
  }

  stepPage(delta: number): void {
    const i = pageIndex(this.doc, this.currentPageId);
    const next = this.doc.pages[i + delta];
    if (next) this.setPage(next.id);
  }

  addPage(): void {
    const i = pageIndex(this.doc, this.currentPageId);
    const next = addPageOp(this.doc, i);
    this.apply(next);
    this.setPage(next.pages[i + 1].id);
  }

  duplicateCurrentPage(): void {
    const i = pageIndex(this.doc, this.currentPageId);
    const next = duplicatePageOp(this.doc, this.currentPageId);
    this.apply(next);
    this.setPage(next.pages[i + 1].id);
  }

  deleteCurrentPage(): void {
    if (this.doc.pages.length <= 1) return;
    const i = pageIndex(this.doc, this.currentPageId);
    const next = deletePageOp(this.doc, this.currentPageId);
    this.apply(next);
    this.setPage(next.pages[Math.min(i, next.pages.length - 1)].id);
  }

  renameCurrentPage(name: string): void {
    this.apply(renamePageOp(this.doc, this.currentPageId, name));
  }

  moveCurrentPage(toIndex: number): void {
    this.apply(movePageOp(this.doc, this.currentPageId, toIndex));
  }

  setTitle(title: string): void {
    this.apply({ ...this.doc, title, updatedAt: Date.now() });
  }

  /* -------------------------------------------------------------- history -- */

  undo(): void {
    const doc = this.history.undo();
    if (doc) this.afterTimeTravel(doc);
  }

  redo(): void {
    const doc = this.history.redo();
    if (doc) this.afterTimeTravel(doc);
  }

  private afterTimeTravel(doc: DrawingDocument): void {
    if (!doc.pages.some((p) => p.id === this.currentPageId)) {
      this.currentPageId = doc.pages[0].id;
    }
    const live = new Set(this.page.objects.map((o) => o.id));
    this.selection = this.selection.filter((id) => live.has(id));
    if (this.editingTextId && !live.has(this.editingTextId)) this.editingTextId = null;
    this.notify();
  }
}
