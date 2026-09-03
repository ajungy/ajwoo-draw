import type { DrawingDocument } from '../model/types';

const MAX_ENTRIES = 200;

/**
 * Snapshot history over an immutably-updated document.
 *
 * Snapshots are cheap because every document operation structurally shares the
 * parts it didn't touch — an entry is one object reference, not a deep copy.
 * Entries are pushed on meaningful operations only; a continuous pen stroke or
 * a whole drag gesture commits exactly once.
 */
export class History {
  private entries: DrawingDocument[];
  private index: number;

  constructor(initial: DrawingDocument) {
    this.entries = [initial];
    this.index = 0;
  }

  get current(): DrawingDocument {
    return this.entries[this.index];
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }

  push(doc: DrawingDocument): void {
    if (doc === this.current) return;
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(doc);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    this.index = this.entries.length - 1;
  }

  /** Replaces the newest entry without adding a step — used to coalesce edits. */
  amend(doc: DrawingDocument): void {
    this.entries[this.index] = doc;
  }

  undo(): DrawingDocument | null {
    if (!this.canUndo) return null;
    this.index--;
    return this.current;
  }

  redo(): DrawingDocument | null {
    if (!this.canRedo) return null;
    this.index++;
    return this.current;
  }

  /** Discards history and restarts from `doc` (new document, share import). */
  reset(doc: DrawingDocument): void {
    this.entries = [doc];
    this.index = 0;
  }
}
