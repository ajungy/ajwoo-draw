import { useEditor } from '../app/useStore';
import { IconButton } from '../ui/IconButton';
import type { IconName } from '../ui/Icon';
import type { ToolId } from '../document/model/types';

const TOOLS: { id: ToolId; icon: IconName; label: string; key: string }[] = [
  { id: 'select', icon: 'select', label: 'Select', key: 'V' },
  { id: 'hand', icon: 'hand', label: 'Hand', key: 'H' },
  { id: 'pen', icon: 'pen', label: 'Pen', key: 'P' },
  { id: 'line', icon: 'line', label: 'Line', key: 'L' },
  { id: 'shape', icon: 'shape', label: 'Shape', key: 'S' },
  { id: 'text', icon: 'text', label: 'Text', key: 'T' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
];

/**
 * The tool row. On a wide-enough header it lives inline in the header bar
 * (`inHeader`); otherwise it gets its own row directly underneath, above the
 * contextual row. Either way it never drops to the bottom of the screen, so a
 * person's hand always knows where it is. Sized `sm`, same as every other
 * icon button in the app — nothing about being "the toolbar" earns these a
 * bigger box.
 */
export function Toolbar({ inHeader = false }: { inHeader?: boolean }) {
  const store = useEditor();
  return (
    <nav
      className={inHeader ? 'toolbar-row toolbar-row--inline toolbar' : 'toolbar-row toolbar-row--standalone toolbar'}
      aria-label="Drawing tools"
    >
      {TOOLS.map((tool) => (
        <IconButton
          key={tool.id}
          icon={tool.icon}
          label={`${tool.label} (${tool.key})`}
          size="sm"
          active={store.tool === tool.id}
          onClick={() => store.setTool(tool.id)}
        />
      ))}
    </nav>
  );
}
