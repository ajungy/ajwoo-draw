import { useEditor } from '../app/useStore';

/**
 * A text description of what is on the current page, for screen readers.
 *
 * A canvas is opaque to assistive technology, so the drawing's structure — how
 * many objects, of what kind, and every label the user typed — is published
 * here instead. It updates with the document, not with pointer movement.
 */
export function CanvasDescription() {
  const store = useEditor();
  const { objects } = store.page;

  const counts = { pen: 0, shape: 0, line: 0, text: 0 };
  const labels: string[] = [];
  for (const o of objects) {
    counts[o.type]++;
    if (o.type === 'shape' && o.text.trim() !== '') labels.push(o.text.trim());
    if (o.type === 'text' && o.text.trim() !== '') labels.push(o.text.trim());
  }

  const parts = [
    plural(counts.pen, 'pen stroke'),
    plural(counts.shape, 'shape'),
    plural(counts.line, 'line'),
    plural(counts.text, 'text object'),
  ].filter((p): p is string => p !== null);

  const summary =
    parts.length === 0
      ? 'This page is empty. Choose a tool and draw to begin.'
      : `${parts.join(', ')}.`;

  return (
    <div className="visually-hidden">
      <p role="status">
        {store.doc.title}, page {store.pageNumber} of {store.doc.pages.length}. {summary}
      </p>
      {labels.length > 0 && (
        <>
          <p>Labels on this page:</p>
          <ul>
            {labels.map((label, i) => (
              <li key={i}>{label}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function plural(count: number, noun: string): string | null {
  if (count === 0) return null;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
