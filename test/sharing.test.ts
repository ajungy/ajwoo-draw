import { describe, expect, it } from 'vitest';
import {
  buildShareUrl,
  decodeDocument,
  encodeDocument,
  readShareFragment,
  ShareTooLargeError,
} from '../src/sharing/shareLink';
import { InvalidDocumentError } from '../src/document/serialization/schema';
import { addObjects, createDocument } from '../src/document/model/document';
import { newId } from '../src/document/model/ids';
import { pen, shape } from './factories';

const BASE = 'https://draw.example.com/';

describe('share links', () => {
  it('round-trips a document through the fragment payload', async () => {
    let doc = createDocument('Flow');
    doc = addObjects(doc, doc.pages[0].id, [shape({ text: 'User Login' }), pen()]);
    const decoded = await decodeDocument(await encodeDocument(doc));
    expect(decoded.title).toBe('Flow');
    expect(decoded.pages[0].objects).toHaveLength(2);
    expect(decoded.pages[0].objects[0]).toMatchObject({ text: 'User Login' });
  });

  it('compresses well enough for a real diagram to fit in a link', async () => {
    let doc = createDocument();
    doc = addObjects(
      doc,
      doc.pages[0].id,
      Array.from({ length: 12 }, (_, i) => shape({ text: `Step ${i}`, frame: { x: i * 40, y: 0, w: 120, h: 60 } })),
    );
    const url = await buildShareUrl(doc, BASE);
    expect(url.startsWith(`${BASE}#drawing=`)).toBe(true);
  });

  it('refuses to build a link that is too large to send', async () => {
    let doc = createDocument();
    // Random points do not compress, which is exactly the worst case to guard.
    const strokes = Array.from({ length: 60 }, () =>
      pen({
        id: newId(),
        points: Array.from({ length: 400 }, () => ({
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          p: Math.random(),
        })),
      }),
    );
    doc = addObjects(doc, doc.pages[0].id, strokes);
    await expect(buildShareUrl(doc, BASE)).rejects.toBeInstanceOf(ShareTooLargeError);
  });

  it('rejects a payload that is not a drawing link', async () => {
    await expect(decodeDocument('hello world')).rejects.toBeInstanceOf(InvalidDocumentError);
  });

  it('rejects a damaged payload rather than rendering garbage', async () => {
    const payload = await encodeDocument(createDocument());
    const damaged = `${payload.slice(0, -8)}zzzzzzzz`;
    await expect(decodeDocument(damaged)).rejects.toBeInstanceOf(InvalidDocumentError);
  });

  it('rejects a well-formed payload carrying a document from a newer version', async () => {
    const future = btoa(JSON.stringify({ version: 99, pages: [{ objects: [] }] }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await expect(decodeDocument(`d0:${future}`)).rejects.toBeInstanceOf(InvalidDocumentError);
  });

  it('reads the drawing payload out of a hash, and nothing else', () => {
    expect(readShareFragment('#drawing=d1:abc')).toBe('d1:abc');
    expect(readShareFragment('#other=1')).toBeNull();
    expect(readShareFragment('')).toBeNull();
  });
});
