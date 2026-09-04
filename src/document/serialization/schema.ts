import { newId } from '../model/ids';
import {
  DOCUMENT_VERSION,
  type ArrowHead,
  type ConnectorAnchor,
  type DrawingDocument,
  type DrawingObject,
  type DrawingPage,
  type EndpointBinding,
  type FontFamily,
  type LineStyle,
  type Point,
  type Rect,
  type ShapeKind,
  type StrokePoint,
  type TextAlign,
} from '../model/types';

/**
 * Every document that arrives from outside this tab — IndexedDB, a share link,
 * a pasted payload, an imported file — passes through here first.
 *
 * The rule is validate-and-coerce, never trust: unknown fields are dropped,
 * every value is forced to its expected type and range, and anything
 * unrecoverable throws. Nothing from a serialized document is ever executed,
 * and no field is ever interpreted as HTML or a URL.
 */
export class InvalidDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDocumentError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Control characters are stripped so a payload cannot smuggle escape sequences
 *  through a text label. Newline and tab are kept — they are real content. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, 20000).replace(CONTROL_CHARS, '') : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Only literal hex is accepted. This deliberately rejects `url(...)`, CSS
 * variables, and anything else that could reference an external resource once
 * the value reaches an SVG export.
 */
function color(v: unknown, fallback = '#18181B'): string {
  return typeof v === 'string' && HEX.test(v) ? v : fallback;
}

function nullableColor(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && HEX.test(v) ? v : null;
}

function point(v: unknown): Point {
  const o = isObj(v) ? v : {};
  return { x: num(o.x), y: num(o.y) };
}

function rect(v: unknown): Rect {
  const o = isObj(v) ? v : {};
  return { x: num(o.x), y: num(o.y), w: Math.max(0, num(o.w, 1)), h: Math.max(0, num(o.h, 1)) };
}

function binding(v: unknown): EndpointBinding | undefined {
  if (!isObj(v) || typeof v.objectId !== 'string') return undefined;
  const anchors: ConnectorAnchor[] = ['top', 'right', 'bottom', 'left', 'center'];
  return { objectId: v.objectId.slice(0, 64), anchor: oneOf(v.anchor, anchors, 'center') };
}

const SHAPE_KINDS: ShapeKind[] = ['rectangle', 'ellipse', 'triangle', 'star', 'arrow', 'heart', 'note'];
const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted'];
const ARROWS: ArrowHead[] = ['none', 'arrow'];
const FONTS: FontFamily[] = ['sans', 'serif', 'mono', 'hand'];
const ALIGNS: TextAlign[] = ['left', 'center', 'right'];

const MAX_POINTS_PER_STROKE = 20000;

function parseObject(v: unknown, z: number): DrawingObject | null {
  if (!isObj(v)) return null;
  const id = typeof v.id === 'string' && v.id.length > 0 ? v.id.slice(0, 64) : newId();
  const zi = num(v.z, z);

  switch (v.type) {
    case 'pen': {
      const raw = Array.isArray(v.points) ? v.points.slice(0, MAX_POINTS_PER_STROKE) : [];
      const points: StrokePoint[] = raw.map((p) => {
        const o = isObj(p) ? p : {};
        return { x: num(o.x), y: num(o.y), p: Math.min(1, Math.max(0, num(o.p, 0.6))) };
      });
      if (points.length === 0) return null;
      return {
        id,
        type: 'pen',
        z: zi,
        points,
        color: color(v.color),
        size: Math.min(200, Math.max(0.5, num(v.size, 4))),
      };
    }
    case 'line': {
      const start = binding(v.startBinding);
      const end = binding(v.endBinding);
      return {
        id,
        type: 'line',
        z: zi,
        a: point(v.a),
        b: point(v.b),
        color: color(v.color),
        size: Math.min(200, Math.max(0.5, num(v.size, 4))),
        style: oneOf(v.style, LINE_STYLES, 'solid'),
        startArrow: oneOf(v.startArrow, ARROWS, 'none'),
        endArrow: oneOf(v.endArrow, ARROWS, 'none'),
        ...(start ? { startBinding: start } : {}),
        ...(end ? { endBinding: end } : {}),
      };
    }
    case 'shape':
      return {
        id,
        type: 'shape',
        z: zi,
        kind: oneOf(v.kind, SHAPE_KINDS, 'rectangle'),
        frame: rect(v.frame),
        rotation: num(v.rotation),
        fill: nullableColor(v.fill),
        stroke: nullableColor(v.stroke),
        size: Math.min(200, Math.max(0, num(v.size, 4))),
        text: str(v.text),
        textColor: color(v.textColor),
        fontSize: Math.min(400, Math.max(6, num(v.fontSize, 20))),
      };
    case 'text': {
      const weight = num(v.fontWeight, 500);
      return {
        id,
        type: 'text',
        z: zi,
        at: point(v.at),
        width: Math.min(20000, Math.max(24, num(v.width, 240))),
        text: str(v.text),
        color: color(v.color),
        fontFamily: oneOf(v.fontFamily, FONTS, 'sans'),
        fontSize: Math.min(400, Math.max(6, num(v.fontSize, 20))),
        fontWeight: weight === 400 || weight === 600 ? weight : 500,
        italic: bool(v.italic),
        underline: bool(v.underline),
        align: oneOf(v.align, ALIGNS, 'left'),
      };
    }
    default:
      return null;
  }
}

function parsePage(v: unknown, index: number): DrawingPage {
  const o = isObj(v) ? v : {};
  const rawObjects = Array.isArray(o.objects) ? o.objects : [];
  const objects = rawObjects
    .map((raw, i) => parseObject(raw, i + 1))
    .filter((x): x is DrawingObject => x !== null);
  // A binding pointing outside this page would resolve to nothing, so drop it
  // rather than leave a connector attached to a phantom.
  const ids = new Set(objects.map((x) => x.id));
  for (const obj of objects) {
    if (obj.type !== 'line') continue;
    if (obj.startBinding && !ids.has(obj.startBinding.objectId)) delete obj.startBinding;
    if (obj.endBinding && !ids.has(obj.endBinding.objectId)) delete obj.endBinding;
  }
  const name = str(o.name).slice(0, 120);
  return {
    id: typeof o.id === 'string' && o.id.length > 0 ? o.id.slice(0, 64) : newId(),
    name: name || `Page ${index + 1}`,
    objects: objects.sort((a, b) => a.z - b.z),
  };
}

export function parseDocument(input: unknown): DrawingDocument {
  if (!isObj(input)) throw new InvalidDocumentError('Not a drawing document.');
  const version = num(input.version, 0);
  if (version < 1 || version > DOCUMENT_VERSION) {
    throw new InvalidDocumentError(
      version > DOCUMENT_VERSION
        ? 'This drawing was made with a newer version of the app.'
        : 'Unrecognised drawing format.',
    );
  }
  const rawPages = Array.isArray(input.pages) ? input.pages : [];
  const pages = rawPages.slice(0, 200).map(parsePage);
  if (pages.length === 0) throw new InvalidDocumentError('This drawing has no pages.');

  const now = Date.now();
  const title = str(input.title).slice(0, 200);
  return {
    version: DOCUMENT_VERSION,
    id: typeof input.id === 'string' && input.id.length > 0 ? input.id.slice(0, 64) : newId(),
    title: title || 'Untitled',
    pages,
    createdAt: num(input.createdAt, now),
    updatedAt: num(input.updatedAt, now),
  };
}

/** Compact JSON — no derived state, no runtime fields. */
export function serializeDocument(doc: DrawingDocument): string {
  return JSON.stringify(doc);
}

export function deserializeDocument(json: string): DrawingDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvalidDocumentError('This drawing data could not be read.');
  }
  return parseDocument(parsed);
}
