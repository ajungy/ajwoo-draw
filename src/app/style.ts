import type {
  ArrowHead,
  FontFamily,
  LineStyle,
  ShapeKind,
  TextAlign,
} from '../document/model/types';

/**
 * The drawing palette. Ink first, then a small set of hues — this is content
 * colour chosen by the user, not UI colour, so it is deliberately separate from
 * the design-system tokens.
 */
export const PALETTE = [
  { name: 'Ink', value: '#18181B' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Amber', value: '#D97706' },
  { name: 'Red', value: '#DC2626' },
  { name: 'Violet', value: '#7C3AED' },
] as const;

export const FILL_SWATCHES = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Grey', value: '#E4E4E7' },
  { name: 'Blue', value: '#DBEAFE' },
  { name: 'Green', value: '#DCFCE7' },
  { name: 'Amber', value: '#FEF3C7' },
  { name: 'Red', value: '#FEE2E2' },
  { name: 'Transparent', value: null },
] as const;

/** Same hues as `PALETTE`, plus a transparent option — last, matching
 *  `FILL_SWATCHES` — for a shape drawn with no outline at all. */
export const STROKE_SWATCHES = [
  ...PALETTE.map((c) => ({ name: c.name, value: c.value as string | null })),
  { name: 'Transparent', value: null },
] as const;

export const STROKE_SIZES = [2, 4, 8, 16] as const;
export const FONT_SIZES = [14, 20, 28, 40] as const;

/** Style the next created object inherits. Persisted with preferences. */
export interface StyleState {
  color: string;
  size: number;
  fill: string | null;
  /** Shape outline colour, kept separate from `color` (which pen/line/text
   *  labels all share) since a shape's stroke alone can go transparent. */
  strokeColor: string | null;
  lineStyle: LineStyle;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
  connector: boolean;
  shapeKind: ShapeKind;
  fontFamily: FontFamily;
  fontSize: number;
  fontWeight: 400 | 500 | 600;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
}

export const DEFAULT_STYLE: StyleState = {
  color: PALETTE[0].value,
  size: 4,
  fill: null,
  strokeColor: PALETTE[0].value,
  lineStyle: 'solid',
  startArrow: 'none',
  endArrow: 'arrow',
  connector: true,
  shapeKind: 'rectangle',
  fontFamily: 'sans',
  fontSize: 20,
  fontWeight: 500,
  italic: false,
  underline: false,
  align: 'left',
};
