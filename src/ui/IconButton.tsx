import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required: an icon-only control always carries an accessible name. */
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
  tone?: 'neutral' | 'danger';
}

export function IconButton({
  icon,
  label,
  active = false,
  size = 'md',
  tone = 'neutral',
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button icon-button--${size} icon-button--${tone} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      data-active={active || undefined}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 18 : 20} />
    </button>
  );
}
