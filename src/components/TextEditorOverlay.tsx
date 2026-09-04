import { useEffect, useLayoutEffect, useRef } from 'react';
import { useEditor } from '../app/useStore';
import { labelInset } from '../canvas/shapes';
import { LINE_HEIGHT, RESOLVED_FONT_STACKS } from '../canvas/text';
import { textBounds } from '../document/model/objects';
import { rectCenter, worldToScreen } from '../geometry';
import type { ShapeObject, TextObject } from '../document/model/types';

/**
 * Text is edited in a real `<textarea>` sitting over the canvas, not in a
 * bespoke canvas caret. That buys the native mobile keyboard, selection
 * handles, autocorrect, dictation, IME input, and screen-reader support for
 * free — and it is the only mechanism that is genuinely pleasant on a phone.
 *
 * The committed value lands in the document model on blur; the object updates
 * live while typing so the drawing underneath never disagrees with the editor.
 */
export function TextEditorOverlay() {
  const store = useEditor();
  const id = store.editingTextId;
  const ref = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const object = id ? store.objectById(id) : undefined;
  const editable = object && (object.type === 'text' || object.type === 'shape') ? object : null;
  /** Text at the moment editing began, so the whole edit is one undo step. */
  const openedWith = useRef<string>('');

  useLayoutEffect(() => {
    if (!editable) return;
    openedWith.current = editable.text;
    const el = ref.current;
    if (!el) return;
    el.value = editable.text;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editable?.id]);

  // Position follows the camera without rerendering React.
  useEffect(() => {
    if (!editable) return;
    const place = () => {
      const box = boxRef.current;
      if (!box) return;
      const { camera } = store;
      if (editable.type === 'shape') {
        const shape = editable as ShapeObject;
        const inset = labelInset(shape.kind);
        const width = shape.frame.w * (1 - inset.x * 2) * camera.zoom;
        const centre = worldToScreen(camera, rectCenter(shape.frame));
        box.style.width = `${Math.max(48, width)}px`;
        box.style.left = `${centre.x - Math.max(48, width) / 2}px`;
        box.style.top = `${centre.y}px`;
        box.style.transform = 'translateY(-50%)';
        box.dataset.mode = 'shape';
      } else {
        const text = editable as TextObject;
        const bounds = textBounds(text);
        const tl = worldToScreen(camera, { x: bounds.x, y: bounds.y });
        box.style.width = `${text.width * camera.zoom}px`;
        box.style.left = `${tl.x}px`;
        box.style.top = `${tl.y}px`;
        box.style.transform = 'none';
        box.dataset.mode = 'text';
      }
    };
    place();
    return store.subscribeRender(place);
  }, [store, editable]);

  if (!editable) return null;

  const isShape = editable.type === 'shape';
  const fontSize = isShape ? (editable as ShapeObject).fontSize : (editable as TextObject).fontSize;
  const zoom = store.camera.zoom;
  const scaled = fontSize * zoom;
  // Scrappy mode renders every label in the handwritten face on the canvas —
  // the editor has to match while typing, or the text visibly changes font
  // the moment it's committed and the overlay closes.
  const font = store.scrappy ? 'hand' : isShape ? 'sans' : (editable as TextObject).fontFamily;
  const color = isShape ? (editable as ShapeObject).textColor : (editable as TextObject).color;

  const commit = (value: string, addHistoryStep: boolean) => {
    const current = store.objectById(editable.id);
    if (!current || (current.type !== 'text' && current.type !== 'shape')) return;
    store.updateObject({ ...current, text: value }, addHistoryStep);
  };

  const close = () => {
    const value = ref.current?.value ?? '';
    const current = store.objectById(editable.id);
    // An empty text object the user never typed into is noise — drop it.
    if (current?.type === 'text' && value.trim() === '') {
      store.setEditingText(null);
      store.setSelection([current.id]);
      store.deleteSelection();
      return;
    }
    if (value !== openedWith.current) commit(value, true);
    store.setEditingText(null);
  };

  return (
    <div className="text-editor" ref={boxRef}>
      <textarea
        ref={ref}
        className="text-editor__input"
        aria-label={isShape ? 'Shape label' : 'Text'}
        spellCheck={false}
        rows={1}
        style={{
          fontFamily: RESOLVED_FONT_STACKS[font],
          fontSize: `${scaled}px`,
          lineHeight: `${scaled * LINE_HEIGHT}px`,
          fontWeight: isShape ? 500 : (editable as TextObject).fontWeight,
          fontStyle: !isShape && (editable as TextObject).italic ? 'italic' : 'normal',
          textAlign: isShape ? 'center' : (editable as TextObject).align,
          color,
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          // Amend rather than commit: a whole edit session is one undo step.
          commit(el.value, false);
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }}
        onBlur={close}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            ref.current?.blur();
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            ref.current?.blur();
          }
        }}
      />
    </div>
  );
}
