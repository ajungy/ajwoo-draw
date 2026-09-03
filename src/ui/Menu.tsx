import { useEffect, useRef, type ReactNode } from 'react';

interface MenuProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  align?: 'left' | 'right';
}

/**
 * A popover menu with the expected keyboard contract: Escape closes, focus is
 * moved in on open and returned to the trigger on close, and an outside pointer
 * dismisses it.
 */
export function Menu({ open, onClose, label, children, align = 'right' }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    ref.current?.querySelector<HTMLElement>('button, [href], input')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={`menu menu--${align}`} role="menu" aria-label={label} ref={ref}>
      {children}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  children: ReactNode;
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
  hint?: string;
}

export function MenuItem({ onSelect, children, tone = 'neutral', disabled, hint }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item menu-item--${tone}`}
      onClick={onSelect}
      disabled={disabled}
    >
      <span>{children}</span>
      {hint && <span className="menu-item__hint">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-separator" role="separator" />;
}
