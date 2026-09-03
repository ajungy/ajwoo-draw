import type { ReactNode } from 'react';
import { Icon, type IconName } from '../ui/Icon';

/** Compact segmented control used throughout the contextual bars. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: IconName; node?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className="segmented__item"
          aria-label={o.label}
          title={o.label}
          aria-pressed={o.value === value}
          data-active={o.value === value || undefined}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} size={18} /> : (o.node ?? o.label)}
        </button>
      ))}
    </div>
  );
}

export function Swatches({
  label,
  value,
  colors,
  onChange,
}: {
  label: string;
  value: string | null;
  colors: readonly { name: string; value: string | null }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c.name}
          type="button"
          className="swatch"
          aria-label={c.name}
          title={c.name}
          aria-pressed={c.value === value}
          data-active={c.value === value || undefined}
          data-none={c.value === null || undefined}
          style={c.value ? { ['--swatch' as string]: c.value } : undefined}
          onClick={() => onChange(c.value)}
        />
      ))}
    </div>
  );
}

/** Stroke/font weight picker, drawn as the thing it controls. */
export function SizePicker({
  label,
  value,
  sizes,
  onChange,
  render = 'dot',
}: {
  label: string;
  value: number;
  sizes: readonly number[];
  onChange: (value: number) => void;
  render?: 'dot' | 'text';
}) {
  return (
    <div className="sizes" role="group" aria-label={label}>
      {sizes.map((s, i) => (
        <button
          key={s}
          type="button"
          className="size"
          aria-label={`${label}: ${s}`}
          title={`${label}: ${s}`}
          aria-pressed={s === value}
          data-active={s === value || undefined}
          onClick={() => onChange(s)}
        >
          {render === 'dot' ? (
            <span className="size__dot" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
          ) : (
            <span className="size__text" style={{ fontSize: 11 + i * 3 }}>
              A
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function BarGroup({ children }: { children: ReactNode }) {
  return <div className="bar-group">{children}</div>;
}
