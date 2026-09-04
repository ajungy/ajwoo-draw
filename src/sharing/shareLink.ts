import type { DrawingDocument, DrawingObject, DrawingPage } from '../document/model/types';
import { deserializeDocument, InvalidDocumentError, serializeDocument } from '../document/serialization/schema';

/**
 * Share links carry the whole drawing in the URL fragment.
 *
 * A fragment is never sent to the server, so a shared drawing reaches the
 * recipient's browser without ever touching ours — there is no database, no
 * upload, and nothing to expire. The cost is a size ceiling, which is enforced
 * honestly rather than by silently truncating.
 */
export const FRAGMENT_KEY = 'drawing';

/**
 * Practical ceiling for a link people can actually send. Chrome handles far
 * more, but links get pasted into chat apps, QR codes, and email clients that
 * do not. Coordinate rounding before compression (below) buys real headroom
 * under this number for a detailed drawing without raising it recklessly.
 */
export const MAX_SHARE_CHARS = 20000;

/** Rounds to a fixed number of decimals — plain `toFixed`-style rounding, not
 *  binary-float trickery, so the result stays a normal finite number. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Coordinates arriving from a pointer carry many meaningless decimal places —
 * differences finer than a sub-pixel at any zoom a person actually shares at.
 * Rounding them before compression shrinks both the raw JSON and, more
 * importantly, how well it deflates: fewer distinct digit sequences repeat
 * more often. This runs only on the share-link path; local storage, JSON
 * export, and the live document keep full precision.
 */
function compactForShare(doc: DrawingDocument): DrawingDocument {
  return { ...doc, pages: doc.pages.map(compactPage) };
}

function compactPage(page: DrawingPage): DrawingPage {
  return { ...page, objects: page.objects.map(compactObject) };
}

function compactObject(o: DrawingObject): DrawingObject {
  switch (o.type) {
    case 'pen':
      return {
        ...o,
        size: roundTo(o.size, 1),
        points: o.points.map((p) => ({ x: roundTo(p.x, 1), y: roundTo(p.y, 1), p: roundTo(p.p, 2) })),
      };
    case 'line':
      return {
        ...o,
        size: roundTo(o.size, 1),
        a: { x: roundTo(o.a.x, 1), y: roundTo(o.a.y, 1) },
        b: { x: roundTo(o.b.x, 1), y: roundTo(o.b.y, 1) },
      };
    case 'shape':
      return {
        ...o,
        size: roundTo(o.size, 1),
        rotation: roundTo(o.rotation, 3),
        fontSize: roundTo(o.fontSize, 1),
        frame: {
          x: roundTo(o.frame.x, 1),
          y: roundTo(o.frame.y, 1),
          w: roundTo(o.frame.w, 1),
          h: roundTo(o.frame.h, 1),
        },
      };
    case 'text':
      return {
        ...o,
        fontSize: roundTo(o.fontSize, 1),
        width: roundTo(o.width, 1),
        at: { x: roundTo(o.at.x, 1), y: roundTo(o.at.y, 1) },
      };
  }
}

export class ShareTooLargeError extends Error {
  constructor(readonly length: number) {
    super('This drawing is too large for a link-only share.');
    this.name = 'ShareTooLargeError';
  }
}

// Not just a feature-detect on the constructors existing — some older
// implementations have `CompressionStream` but throw on the `'deflate-raw'`
// format specifically. Actually constructing (and immediately discarding) one
// is the only reliable way to know encoding won't blow up mid-share.
const hasCompression = (): boolean => {
  if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') return false;
  try {
    new CompressionStream('deflate-raw');
    new DecompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = transform.writable.getWriter();
  // A corrupt payload makes the write side reject too; the read side below
  // reports the same failure, so swallow this one rather than leaving an
  // unhandled rejection behind.
  void writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => undefined);

  const reader = transform.readable.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * `d1:` is deflate-compressed, `d0:` is plain — the prefix means a link made in
 * a browser with compression still opens in one without it.
 */
export async function encodeDocument(doc: DrawingDocument): Promise<string> {
  const json = serializeDocument(compactForShare(doc));
  const raw = new TextEncoder().encode(json);
  if (!hasCompression()) return `d0:${bytesToBase64Url(raw)}`;
  const deflated = await pipe(raw, new CompressionStream('deflate-raw'));
  return `d1:${bytesToBase64Url(deflated)}`;
}

export async function decodeDocument(payload: string): Promise<DrawingDocument> {
  const marker = payload.slice(0, 3);
  const body = payload.slice(3);
  if (marker !== 'd0:' && marker !== 'd1:') {
    throw new InvalidDocumentError('This share link is not a drawing link.');
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64UrlToBytes(body);
    if (marker === 'd1:') {
      if (!hasCompression()) {
        throw new InvalidDocumentError('This browser cannot open compressed share links.');
      }
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
  } catch (error) {
    if (error instanceof InvalidDocumentError) throw error;
    throw new InvalidDocumentError('This share link is damaged or incomplete.');
  }
  return deserializeDocument(new TextDecoder().decode(bytes));
}

/** Throws `ShareTooLargeError` rather than producing a link that will not survive being pasted. */
export async function buildShareUrl(doc: DrawingDocument, baseUrl: string): Promise<string> {
  const payload = await encodeDocument(doc);
  const url = `${baseUrl.split('#')[0]}#${FRAGMENT_KEY}=${payload}`;
  if (url.length > MAX_SHARE_CHARS) throw new ShareTooLargeError(url.length);
  return url;
}

/** Reads a drawing out of `location.hash`, returning null when there isn't one. */
export function readShareFragment(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') return null;
  const params = new URLSearchParams(raw);
  return params.get(FRAGMENT_KEY);
}
