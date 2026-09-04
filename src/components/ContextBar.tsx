import type { ReactNode } from 'react';
import { useEditor } from '../app/useStore';
import { FILL_SWATCHES, FONT_SIZES, PALETTE, STROKE_SIZES, STROKE_SWATCHES } from '../app/style';
import { RESOLVED_FONT_STACKS } from '../canvas/text';
import { IconButton } from '../ui/IconButton';
import type { IconName } from '../ui/Icon';
import { BarGroup, LabeledSwatches, Segmented, SizePicker, Swatches } from './controls';
import type {
  DrawingObject,
  FontFamily,
  LineStyle,
  ShapeKind,
  TextAlign,
} from '../document/model/types';

const SHAPES: { value: ShapeKind; label: string; icon: IconName }[] = [
  { value: 'rectangle', label: 'Rectangle', icon: 'rectangle' },
  { value: 'ellipse', label: 'Ellipse', icon: 'ellipse' },
  { value: 'triangle', label: 'Triangle', icon: 'triangle' },
  { value: 'star', label: 'Star', icon: 'star' },
  { value: 'arrow', label: 'Arrow', icon: 'arrow' },
  { value: 'heart', label: 'Heart', icon: 'heart' },
  { value: 'note', label: 'Note', icon: 'note' },
];

const LINE_STYLES: { value: LineStyle; label: string; node: string }[] = [
  { value: 'solid', label: 'Solid line', node: '——' },
  { value: 'dashed', label: 'Dashed line', node: '– –' },
  { value: 'dotted', label: 'Dotted line', node: '· ·' },
];

// Three families, not four: one sans, one serif, one handwritten — Mono
// dropped from the picker (still a valid `FontFamily` for older documents
// that already used it, just not offered as a new choice).
const FONTS: { value: FontFamily; label: string }[] = [
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'hand', label: 'Hand' },
];

/** Each option is set in its own typeface, so the picker previews the choice
 *  rather than naming it — the point of a font picker is to show, not tell. */
const FONT_OPTIONS = FONTS.map((f) => ({
  value: f.value,
  label: f.label,
  node: (
    <span style={{ fontFamily: RESOLVED_FONT_STACKS[f.value], fontSize: 16 }} aria-hidden="true">
      Aa
    </span>
  ),
}));

const ALIGNS: { value: TextAlign; label: string; icon: IconName }[] = [
  { value: 'left', label: 'Align left', icon: 'align-left' },
  { value: 'center', label: 'Align centre', icon: 'align-center' },
  { value: 'right', label: 'Align right', icon: 'align-right' },
];

/**
 * The contextual row above the canvas.
 *
 * What it shows is decided by the selection first and the active tool second,
 * so the controls on screen are always the ones that apply to what the user
 * is touching right now. Its internal layout follows one fixed pattern for
 * every mode, so the eye learns it once: colour pickers are always at the far
 * left, the size/weight control is always at the far right, and whatever is
 * unique to that mode sits centred between them.
 */
export function ContextBar() {
  const store = useEditor();
  const selected = store.selectedObjects();
  const mode = contextMode(selected, store.tool);
  // With nothing to show — Select or Hand with no selection, the Eraser, the
  // instant between clearing one selection and the next — the row still
  // mounts (so its height-collapse animation has something to animate from),
  // it just collapses to nothing rather than showing empty. See the
  // `.context-bar` / `.context-bar--empty` transition in app.css: it slides
  // up into the header when it empties out and slides back down when it next
  // has something to show.
  if (!mode) return <div className="context-bar context-bar--empty" aria-hidden="true" />;

  /** Applies a style to the selection when there is one, and to the next object otherwise. */
  const apply = (patch: Partial<Record<string, unknown>>, toObject: (o: DrawingObject) => DrawingObject) => {
    store.setStyle(patch as never);
    if (selected.length > 0) store.updateMany(selected.map(toObject));
  };

  const setColor = (color: string | null) => {
    if (color === null) return;
    apply({ color }, (o) =>
      o.type === 'shape' ? { ...o, stroke: color, textColor: color } : { ...o, color },
    );
  };

  const setSize = (size: number) =>
    apply({ size }, (o) => (o.type === 'text' ? o : { ...o, size }));

  /** The shape stroke swatch: separate from `color` so it alone can go
   *  transparent without taking the label text colour with it. */
  const setStrokeColor = (stroke: string | null) =>
    apply({ strokeColor: stroke }, (o) =>
      o.type === 'shape' ? { ...o, stroke, textColor: stroke ?? o.textColor } : o,
    );

  let left: ReactNode = null;
  let center: ReactNode = null;
  let right: ReactNode = null;

  if (mode === 'pen') {
    left = <Swatches label="Stroke colour" value={store.style.color} colors={PALETTE} onChange={setColor} />;
    right = <SizePicker label="Thickness" value={store.style.size} sizes={STROKE_SIZES} onChange={setSize} />;
  }

  if (mode === 'line') {
    left = <Swatches label="Line colour" value={store.style.color} colors={PALETTE} onChange={setColor} />;
    center = (
      <>
        <Segmented
          label="Line style"
          value={store.style.lineStyle}
          options={LINE_STYLES.map((s) => ({ value: s.value, label: s.label, node: s.node }))}
          onChange={(lineStyle) =>
            apply({ lineStyle }, (o) => (o.type === 'line' ? { ...o, style: lineStyle } : o))
          }
        />
        <BarGroup>
          <IconButton
            icon="arrow-start"
            label="Arrow at start"
            size="sm"
            active={store.style.startArrow === 'arrow'}
            onClick={() => {
              const startArrow = store.style.startArrow === 'arrow' ? 'none' : 'arrow';
              apply({ startArrow }, (o) => (o.type === 'line' ? { ...o, startArrow } : o));
            }}
          />
          <IconButton
            icon="arrow-end"
            label="Arrow at end"
            size="sm"
            active={store.style.endArrow === 'arrow'}
            onClick={() => {
              const endArrow = store.style.endArrow === 'arrow' ? 'none' : 'arrow';
              apply({ endArrow }, (o) => (o.type === 'line' ? { ...o, endArrow } : o));
            }}
          />
          <IconButton
            icon="connector"
            label="Connector: snap to shapes"
            size="sm"
            active={store.style.connector}
            onClick={() => store.setStyle({ connector: !store.style.connector })}
          />
        </BarGroup>
      </>
    );
    right = <SizePicker label="Thickness" value={store.style.size} sizes={STROKE_SIZES} onChange={setSize} />;
  }

  if (mode === 'shape') {
    left = (
      <>
        <Swatches
          label="Stroke colour"
          value={store.style.strokeColor}
          colors={STROKE_SWATCHES}
          onChange={setStrokeColor}
        />
        <LabeledSwatches
          label="Fill"
          value={store.style.fill}
          colors={FILL_SWATCHES}
          onChange={(fill) => apply({ fill }, (o) => (o.type === 'shape' ? { ...o, fill } : o))}
        />
      </>
    );
    center = selected.length === 0 && (
      <Segmented
        label="Shape"
        value={store.style.shapeKind}
        options={SHAPES}
        onChange={(shapeKind) => store.setStyle({ shapeKind })}
      />
    );
    right = <SizePicker label="Border thickness" value={store.style.size} sizes={STROKE_SIZES} onChange={setSize} />;
  }

  if (mode === 'text') {
    left = <Swatches label="Text colour" value={store.style.color} colors={PALETTE} onChange={setColor} />;
    center = (
      <>
        <Segmented
          label="Font"
          value={store.style.fontFamily}
          options={FONT_OPTIONS}
          onChange={(fontFamily) =>
            apply({ fontFamily }, (o) => (o.type === 'text' ? { ...o, fontFamily } : o))
          }
        />
        <BarGroup>
          <IconButton
            icon="italic"
            label="Italic"
            size="sm"
            active={store.style.italic}
            onClick={() => {
              const italic = !store.style.italic;
              apply({ italic }, (o) => (o.type === 'text' ? { ...o, italic } : o));
            }}
          />
          <IconButton
            icon="underline"
            label="Underline"
            size="sm"
            active={store.style.underline}
            onClick={() => {
              const underline = !store.style.underline;
              apply({ underline }, (o) => (o.type === 'text' ? { ...o, underline } : o));
            }}
          />
        </BarGroup>
        <Segmented
          label="Alignment"
          value={store.style.align}
          options={ALIGNS}
          onChange={(align) => apply({ align }, (o) => (o.type === 'text' ? { ...o, align } : o))}
        />
      </>
    );
    right = (
      <SizePicker
        label="Font size"
        value={store.style.fontSize}
        sizes={FONT_SIZES}
        render="text"
        onChange={(fontSize) =>
          apply({ fontSize }, (o) => (o.type === 'text' ? { ...o, fontSize } : o.type === 'shape' ? { ...o, fontSize } : o))
        }
      />
    );
  }

  return (
    <div className="context-bar" role="toolbar" aria-label={`${mode} options`}>
      <div className="context-bar__scroll">
        <div className="context-bar__section context-bar__section--left">{left}</div>
        <div className="context-bar__section context-bar__section--center">{center}</div>
        <div className="context-bar__section context-bar__section--right">{right}</div>
      </div>

      {selected.length > 0 && (
        <div className="context-bar__fixed">
          <IconButton icon="duplicate" label="Duplicate" size="sm" onClick={() => store.duplicateSelection()} />
          <IconButton
            icon="trash"
            label="Delete"
            size="sm"
            tone="danger"
            onClick={() => store.deleteSelection()}
          />
        </div>
      )}
    </div>
  );
}

type ContextMode = 'pen' | 'line' | 'shape' | 'text';

/**
 * Selection wins over the active tool; a mixed selection falls back to stroke
 * options. Hand carries no contextual row — its options (zoom, fit) live
 * permanently in the header now, not one tool-switch away.
 */
function contextMode(selected: DrawingObject[], tool: string): ContextMode | null {
  if (selected.length > 0) {
    const kinds = new Set(selected.map((o) => o.type));
    if (kinds.size === 1) {
      const [only] = kinds;
      if (only === 'pen') return 'pen';
      if (only === 'line') return 'line';
      if (only === 'shape') return 'shape';
      if (only === 'text') return 'text';
    }
    return 'pen';
  }
  if (tool === 'pen' || tool === 'line' || tool === 'shape' || tool === 'text') return tool;
  return null;
}
