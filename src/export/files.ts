/** Filesystem and clipboard plumbing. Every capability here is feature-detected. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, filename: string, type: string): void {
  downloadBlob(new Blob([text], { type }), filename);
}

/** Filesystem-safe name derived from the document title. */
export function safeFilename(title: string, extension: string): string {
  const base = title.trim().replace(/[^\w\-. ]+/g, '').replace(/\s+/g, '-').slice(0, 60);
  return `${base || 'drawing'}.${extension}`;
}

export function canWriteClipboardText(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;
}

export async function copyText(text: string): Promise<void> {
  if (!canWriteClipboardText()) throw new Error('Clipboard access is unavailable.');
  await navigator.clipboard.writeText(text);
}

export function canWriteClipboardImage(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.write &&
    typeof ClipboardItem !== 'undefined'
  );
}

export async function copyBlob(blob: Blob): Promise<void> {
  if (!canWriteClipboardImage()) throw new Error('Copying images is unavailable in this browser.');
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

/**
 * Copies text that takes real async work to produce (compressing a share
 * link, say) without losing the click that authorized it.
 *
 * `navigator.clipboard.writeText` requires "recent user activation" — awaiting
 * a slow async step (compression involves several `ReadableStream` round
 * trips) before calling it can let that activation expire, and Chrome then
 * refuses the write with no visible cause. `ClipboardItem` accepts a *promise*
 * as its value and is allowed to wait for it while still honouring the
 * gesture that started the call — so the compute function must be handed in
 * un-awaited, and this must itself be called synchronously from the click
 * handler, not after another `await`.
 */
export async function copyTextAsync(compute: () => Promise<string>): Promise<void> {
  if (!canWriteClipboardImage()) {
    // No promise-accepting ClipboardItem here. Callers are expected to have
    // already finished any slow work and hand in a `compute` that resolves
    // immediately — the plain path below has no way to wait out an
    // activation window, so it is only reliable when there is nothing left
    // to wait for.
    await copyText(await compute());
    return;
  }
  const blobPromise = compute().then((text) => new Blob([text], { type: 'text/plain' }));
  await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blobPromise })]);
}

export function canShareFiles(files: File[]): boolean {
  return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files });
}

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Reads a user-chosen file as text. Used by SVG and JSON import. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsText(file);
  });
}
