import { exportPageToPng } from '../export/png/exportPng';
import { exportPageToSvg } from '../export/svg/exportSvg';
import {
  canShare,
  canShareFiles,
  canWriteClipboardImage,
  canWriteClipboardText,
  copyBlob,
  copyText,
  copyTextAsync,
  downloadBlob,
  downloadText,
  readFileAsText,
  safeFilename,
} from '../export/files';
import { deserializeDocument, InvalidDocumentError, serializeDocument } from '../document/serialization/schema';
import { buildShareUrl, ShareTooLargeError } from '../sharing/shareLink';
import type { EditorStore } from './store';

export interface ActionResult {
  text: string;
  tone: 'neutral' | 'success' | 'danger';
  action?: { label: string; run: () => void };
}

const ok = (text: string): ActionResult => ({ text, tone: 'success' });
const fail = (text: string, action?: ActionResult['action']): ActionResult => ({
  text,
  tone: 'danger',
  ...(action ? { action } : {}),
});

export async function exportSvg(store: EditorStore): Promise<ActionResult> {
  const svg = exportPageToSvg(store.page, { scrappy: store.scrappy });
  downloadText(svg, safeFilename(store.doc.title, 'svg'), 'image/svg+xml');
  return ok('SVG downloaded.');
}

export async function exportPng(store: EditorStore): Promise<ActionResult> {
  try {
    const blob = await exportPageToPng(store.page, { scrappy: store.scrappy });
    downloadBlob(blob, safeFilename(store.doc.title, 'png'));
    return ok('PNG downloaded.');
  } catch (error) {
    return fail(messageOf(error, 'This drawing could not be exported as PNG.'));
  }
}

export async function exportJson(store: EditorStore): Promise<ActionResult> {
  downloadText(serializeDocument(store.doc), safeFilename(store.doc.title, 'json'), 'application/json');
  return ok('Drawing data downloaded.');
}

export async function copySvg(store: EditorStore): Promise<ActionResult> {
  const svg = exportPageToSvg(store.page, { scrappy: store.scrappy });
  if (!canWriteClipboardText()) {
    downloadText(svg, safeFilename(store.doc.title, 'svg'), 'image/svg+xml');
    return ok('Clipboard unavailable — SVG downloaded instead.');
  }
  try {
    await copyText(svg);
    return ok('SVG copied. Paste it straight into Figma.');
  } catch {
    downloadText(svg, safeFilename(store.doc.title, 'svg'), 'image/svg+xml');
    return ok('Clipboard unavailable — SVG downloaded instead.');
  }
}

export async function copyPng(store: EditorStore): Promise<ActionResult> {
  try {
    const blob = await exportPageToPng(store.page, { scrappy: store.scrappy });
    if (!canWriteClipboardImage()) {
      downloadBlob(blob, safeFilename(store.doc.title, 'png'));
      return ok('Clipboard unavailable — PNG downloaded instead.');
    }
    await copyBlob(blob);
    return ok('PNG copied.');
  } catch (error) {
    return fail(messageOf(error, 'This drawing could not be copied.'));
  }
}

/**
 * Share. The link goes straight to the clipboard, ready to paste — that's a
 * faster, quieter action than opening a share sheet just to hand the same
 * link to one app. The native sheet is only a fallback for the rare browser
 * that can't write the clipboard at all.
 *
 * Building the link compresses the whole document, which takes real
 * asynchronous work — so the clipboard write goes through `copyTextAsync`,
 * which hands the browser a promise rather than awaiting the compression
 * first. Awaiting first would let this click's "you're allowed to touch the
 * clipboard" window expire before the write ever happened, and Chrome would
 * silently refuse it.
 */
export async function shareDrawing(
  store: EditorStore,
  onExportSvg: () => void,
): Promise<ActionResult> {
  // Built once and reused by every fallback below — recomputing (re-running
  // compression) on each attempt would also reopen the activation-expiry
  // window the `ClipboardItem`-promise trick exists to avoid.
  let url: string;
  try {
    url = await buildShareUrl(store.doc, location.href);
  } catch (error) {
    if (error instanceof ShareTooLargeError) {
      return fail('This drawing is too large for a link-only share.', {
        label: 'Export SVG',
        run: onExportSvg,
      });
    }
    const reason = error instanceof Error ? error.message : 'an unknown error';
    return fail(`Couldn't prepare a share link: ${reason}`);
  }

  try {
    await copyTextAsync(async () => url);
    return ok('Share link copied — paste it anywhere.');
  } catch {
    // Clipboard access itself failed (permission denied, insecure context,
    // browser without any clipboard-write API) — fall through to other paths
    // rather than surfacing that as the final word.
  }

  if (canShare()) {
    try {
      await navigator.share({ title: store.doc.title, url });
      return { text: 'Shared.', tone: 'neutral' };
    } catch (error) {
      // A cancelled share sheet is not a failure worth reporting.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { text: '', tone: 'neutral' };
      }
    }
  }

  // The link is already built — a retry here is a fresh click, which carries
  // its own "recent user activation", so a plain synchronous copy (no async
  // work in between) succeeds even when the automatic attempt above did not.
  return fail("Couldn't copy the share link automatically.", {
    label: 'Copy link',
    run: () => {
      void copyText(url);
    },
  });
}

export async function sharePng(store: EditorStore): Promise<ActionResult> {
  try {
    const blob = await exportPageToPng(store.page, { scrappy: store.scrappy });
    const file = new File([blob], safeFilename(store.doc.title, 'png'), { type: 'image/png' });
    if (canShare() && canShareFiles([file])) {
      await navigator.share({ files: [file], title: store.doc.title });
      return { text: 'Shared.', tone: 'neutral' };
    }
    downloadBlob(blob, file.name);
    return ok('Sharing files is unavailable — PNG downloaded instead.');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { text: '', tone: 'neutral' };
    }
    return fail(messageOf(error, 'This image could not be shared.'));
  }
}

export async function importFile(store: EditorStore, file: File): Promise<ActionResult> {
  try {
    const text = await readFileAsText(file);
    if (file.name.toLowerCase().endsWith('.json')) {
      const doc = deserializeDocument(text);
      store.replaceDocument(doc);
      return ok(`Opened ${doc.title}.`);
    }
    return fail('Only .json drawing files can be opened. Import SVG is not supported yet.');
  } catch (error) {
    if (error instanceof InvalidDocumentError) return fail(error.message);
    return fail(messageOf(error, 'That file could not be opened.'));
  }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
