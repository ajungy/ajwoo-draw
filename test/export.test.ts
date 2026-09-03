import { describe, expect, it } from 'vitest';
import { exportPageToSvg } from '../src/export/svg/exportSvg';
import { pngPixelSize } from '../src/export/png/exportPng';
import { createPage } from '../src/document/model/document';
import { line, pen, shape, text } from './factories';

function pageWith(objects: Parameters<typeof exportPageToSvg>[0]['objects']) {
  return { ...createPage('Flow'), objects };
}

describe('SVG export', () => {
  it('preserves every object type', () => {
    const svg = exportPageToSvg(
      pageWith([
        pen(),
        shape({ kind: 'ellipse', fill: '#DBEAFE', text: 'Login' }),
        line({ endArrow: 'arrow', style: 'dashed' }),
        text({ text: 'Notes' }),
      ]),
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
    expect(svg).toContain('#DBEAFE');
    expect(svg).toContain('Login');
    expect(svg).toContain('Notes');
    expect(svg).toContain('<polygon'); // the arrow head
    expect(svg).toContain('stroke-dasharray');
  });

  it('sizes the viewBox to the drawing plus padding', () => {
    const svg = exportPageToSvg(pageWith([shape({ frame: { x: 0, y: 0, w: 100, h: 50 } })]), {
      padding: 10,
    });
    // 100 wide + 2px stroke + 20px padding.
    expect(svg).toContain('viewBox="-11 -11 122 72"');
  });

  it('supports a transparent background', () => {
    const withBg = exportPageToSvg(pageWith([shape()]));
    const transparent = exportPageToSvg(pageWith([shape()]), { background: null });
    expect(withBg).toContain('#FFFFFF');
    expect(transparent).not.toContain('fill="#FFFFFF"');
  });

  it('escapes text rather than emitting markup', () => {
    const svg = exportPageToSvg(pageWith([text({ text: '<script>alert(1)</script>' })]));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('never emits scripts or external references', () => {
    const svg = exportPageToSvg(pageWith([pen(), shape({ text: 'x' }), line(), text()]));
    expect(svg).not.toMatch(/<script|xlink:href|href=|url\(/);
  });

  it('handles an empty page without producing a degenerate viewBox', () => {
    const svg = exportPageToSvg(pageWith([]));
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('width="0"');
  });
});

describe('Scrappy mode export', () => {
  it('exports a clean straight edge when off, and a hand-drawn curved one when on', () => {
    const page = pageWith([shape({ frame: { x: 0, y: 0, w: 200, h: 120 } })]);
    const clean = exportPageToSvg(page, { scrappy: false });
    const scrappy = exportPageToSvg(page, { scrappy: true });

    // The fill trace is always clean (see exportSvg.ts); only the stroke
    // trace should differ between the two modes.
    const strokeTags = (svg: string) => svg.match(/<path[^>]*>/g)?.slice(1) ?? [];
    expect(strokeTags(clean)[0]).not.toMatch(/ C /);
    expect(strokeTags(scrappy)[0]).toMatch(/ C /);
  });

  it('renders shape labels and text objects in the handwritten face when on', () => {
    const page = pageWith([shape({ text: 'Login' }), text({ text: 'note' })]);
    const clean = exportPageToSvg(page, { scrappy: false });
    const scrappy = exportPageToSvg(page, { scrappy: true });
    expect(clean).not.toContain('Comic Sans');
    // Every text element switches to the hand stack, not just one of them.
    const handCount = (scrappy.match(/Comic Sans/g) ?? []).length;
    expect(handCount).toBeGreaterThanOrEqual(2);
  });
});

describe('PNG export sizing', () => {
  it('uses the requested scale for an ordinary drawing', () => {
    const size = pngPixelSize({ x: 0, y: 0, w: 800, h: 600 }, 3);
    expect(size).toMatchObject({ width: 2400, height: 1800, scale: 3 });
  });

  it('reduces the scale rather than allocating an unbounded canvas', () => {
    const size = pngPixelSize({ x: 0, y: 0, w: 20000, h: 20000 }, 3);
    expect(size.scale).toBeLessThan(3);
    expect(size.width * size.height).toBeLessThanOrEqual(32_000_000);
  });

  it('never produces a zero-pixel canvas', () => {
    expect(pngPixelSize({ x: 0, y: 0, w: 0.1, h: 0.1 }, 1).width).toBe(1);
  });
});

describe('arrow geometry', () => {
  it('pulls the line body back to the arrowhead base, not its tip', async () => {
    const { arrowBaseCenter, arrowLength } = await import('../src/canvas/renderer/drawObject');
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const base = arrowBaseCenter(from, to, 4);
    const len = arrowLength(4);
    expect(base.x).toBeCloseTo(100 - len * 0.5);
    expect(base.y).toBeCloseTo(0);
  });

  it('shortens only the arrowed end of an SVG line, leaving a plain end untouched', () => {
    const svg = exportPageToSvg(pageWith([line({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, endArrow: 'arrow', startArrow: 'none' })]));
    const match = svg.match(/<line x1="([\d.-]+)" y1="[\d.-]+" x2="([\d.-]+)"/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeCloseTo(0); // start untouched
    expect(Number(match![2])).toBeLessThan(100); // end pulled back from the tip
  });
});
