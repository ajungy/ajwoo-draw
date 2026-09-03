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
