import { useEditor } from '../app/useStore';
import { IconButton } from '../ui/IconButton';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import type { ToolId } from '../document/model/types';

const TOOLS: { id: ToolId; icon: IconName; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Select', key: 'V' },
  { id: 'hand', icon: 'hand', label: 'Hand', key: 'H' },
  { id: 'pen', icon: 'pen', label: 'Pen', key: 'P' },
  { id: 'line', icon: 'line', label: 'Line', key: 'L' },
  { id: 'shape', icon: 'shape', label: 'Shape', key: 'S' },
  { id: 'text', icon: 'text', label: 'Text', key: 'T' },
];

/**
 * The tool row. It has a fixed place — directly under the header, above the
 * contextual row — at every window size; it never migrates into the header or
 * down to the bottom of the screen, so a person's hand always knows where it
 * is.
 */
export function Toolbar() {
  const store = useEditor();
  return (
    <div className="toolbar-row">
      <button
        type="button"
        className="scrappy-toggle"
        aria-pressed={store.scrappy}
        aria-label="Scrappy mode: hand-drawn lines and handwritten text for everything on the canvas"
        title="Scrappy: hand-drawn lines and handwritten text"
        onClick={() => store.toggleScrappy()}
      >
        <Icon name="scrappy" size={16} />
        <span>Scrappy</span>
      </button>
      <nav className="toolbar" aria-label="Drawing tools">
        {TOOLS.map((tool) => (
          <IconButton
            key={tool.id}
            icon={tool.icon}
            label={`${tool.label} (${tool.key})`}
            active={store.tool === tool.id}
            onClick={() => store.setTool(tool.id)}
          />
        ))}
      </nav>
    </div>
  );
}
