import { describe, expect, it } from 'vitest';
import { InvalidDocumentError, parseDocument } from '../src/document/serialization/schema';
import { exportPageToSvg } from '../src/export/svg/exportSvg';
import { createPage } from '../src/document/model/document';

/**
 * Imported and shared drawings are untrusted input. These tests pin the two
 * guarantees that matter: nothing executable survives parsing, and nothing
 * malformed reaches the renderer.
 */
describe('untrusted document data', () => {
  const wrap = (objects: unknown[]) => ({
    version: 1,
    id: 'x',
    title: 'x',
    pages: [{ id: 'p', name: 'p', objects }],
    createdAt: 0,
    updatedAt: 0,
  });

  it('rejects anything that is not a document', () => {
    expect(() => parseDocument(null)).toThrow(InvalidDocumentError);
    expect(() => parseDocument('nope')).toThrow(InvalidDocumentError);
    expect(() => parseDocument({ version: 1, pages: [] })).toThrow(InvalidDocumentError);
  });

  it('drops objects of unknown type instead of passing them through', () => {
    const doc = parseDocument(wrap([{ type: 'iframe', src: 'https://evil.example' }]));
    expect(doc.pages[0].objects).toHaveLength(0);
  });

  it('refuses non-hex colours, so no url() or CSS reference reaches an export', () => {
    const doc = parseDocument(
      wrap([
        {
          type: 'shape',
          kind: 'rectangle',
          frame: { x: 0, y: 0, w: 10, h: 10 },
          stroke: 'url(https://evil.example/x.svg#a)',
          fill: 'javascript:alert(1)',
        },
      ]),
    );
    expect(doc.pages[0].objects[0]).toMatchObject({ stroke: '#18181B', fill: null });
  });

  it('coerces out-of-range numbers rather than trusting them', () => {
    const doc = parseDocument(
      wrap([
        { type: 'pen', points: [{ x: 1, y: 1, p: 900 }], size: Number.POSITIVE_INFINITY },
        { type: 'text', at: { x: NaN, y: 0 }, text: 'hi', fontSize: -40, width: 1e12 },
      ]),
    );
    const [stroke, text] = doc.pages[0].objects;
    expect(stroke).toMatchObject({ size: 4 });
    expect(stroke.type === 'pen' && stroke.points[0].p).toBe(1);
    expect(text).toMatchObject({ fontSize: 6, width: 20000 });
    expect(text.type === 'text' && Number.isFinite(text.at.x)).toBe(true);
  });

  it('strips control and bidi characters from text but keeps newlines', () => {
    // NUL and a right-to-left override, which can disguise what a label says.
    const hostile = 'a\u0000b\nc\u202ed';
    const doc = parseDocument(wrap([{ type: 'text', text: hostile }]));
    const object = doc.pages[0].objects[0];
    expect(object.type === 'text' && object.text).toBe('ab\ncd');
  });

  it('drops connector bindings that point outside the page', () => {
    const doc = parseDocument(
      wrap([{ type: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, endBinding: { objectId: 'ghost' } }]),
    );
    const object = doc.pages[0].objects[0];
    expect(object.type === 'line' && object.endBinding).toBeUndefined();
  });

  it('escapes hostile text when exporting to SVG', () => {
    const doc = parseDocument(wrap([{ type: 'text', text: '"><script>alert(1)</script>' }]));
    const svg = exportPageToSvg({ ...createPage(), objects: doc.pages[0].objects });
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
