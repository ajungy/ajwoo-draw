/**
 * The serializable document model.
 *
 * Everything in this file is plain data: no class instances, no functions, no
 * React state. Anything here can be JSON round-tripped, put in IndexedDB,
 * compressed into a share link, or copied to the clipboard without conversion.
 */

export const DOCUMENT_VERSION = 1;

export type ObjectId = string;
export type PageId = string;

export interface Point {
  x: number;
  y: number;
}

/** A point sampled from a pointer, with pressure in 0..1. */
export interface StrokePoint extends Point {
  p: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ToolId = 'hand' | 'pen' | 'line' | 'shape' | 'text' | 'eraser' | 'select';

export type ShapeKind =
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'arrow'
  | 'heart'
  | 'note';

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type ArrowHead = 'none' | 'arrow';
export type FontFamily = 'sans' | 'serif' | 'mono' | 'hand';
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Where a connector endpoint is bound. `objectId` is the shape it follows;
 * `anchor` is the named connection point on that shape. A free endpoint has no
 * binding and keeps its stored world position.
 */
export type ConnectorAnchor = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface EndpointBinding {
  objectId: ObjectId;
  anchor: ConnectorAnchor;
}

interface BaseObject {
  id: ObjectId;
  /** Ascending paint order; higher draws on top. */
  z: number;
}

export interface PenStroke extends BaseObject {
  type: 'pen';
  points: StrokePoint[];
  color: string;
  /** Nominal stroke width in world units. */
  size: number;
}

export interface LineObject extends BaseObject {
  type: 'line';
  a: Point;
  b: Point;
  color: string;
  size: number;
  style: LineStyle;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
  /** When set, the endpoint tracks the bound shape as it moves. */
  startBinding?: EndpointBinding;
  endBinding?: EndpointBinding;
}

export interface ShapeObject extends BaseObject {
  type: 'shape';
  kind: ShapeKind;
  /** Axis-aligned bounds before rotation. */
  frame: Rect;
  /** Radians, about the frame centre. */
  rotation: number;
  fill: string | null;
  stroke: string | null;
  size: number;
  /** Label drawn centred inside the shape. Empty string means no label. */
  text: string;
  textColor: string;
  fontSize: number;
}

export interface TextObject extends BaseObject {
  type: 'text';
  /** Top-left of the text block in world coordinates. */
  at: Point;
  /** Wrap width in world units. */
  width: number;
  text: string;
  color: string;
  fontFamily: FontFamily;
  fontSize: number;
  fontWeight: 400 | 500 | 600;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
}

export type DrawingObject = PenStroke | LineObject | ShapeObject | TextObject;

export interface DrawingPage {
  id: PageId;
  name: string;
  objects: DrawingObject[];
}

export interface DrawingDocument {
  version: number;
  id: string;
  title: string;
  pages: DrawingPage[];
  createdAt: number;
  updatedAt: number;
}

/** Camera mapping world coordinates to screen coordinates. Never persisted inside a page. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
