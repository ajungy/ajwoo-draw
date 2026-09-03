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
];

export function Toolbar() {
  const store = useEditor();
  return (
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
  );
}
