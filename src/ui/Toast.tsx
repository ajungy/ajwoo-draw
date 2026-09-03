import { useEffect } from 'react';

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'neutral' | 'success' | 'danger';
  /** Optional single follow-up, e.g. "Export SVG instead". */
  action?: { label: string; run: () => void };
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

const DURATIONS = { neutral: 3200, success: 2400, danger: 6000 } as const;

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    // A message carrying an action stays until it is dealt with.
    if (toast.action) return;
    const timer = window.setTimeout(onDismiss, DURATIONS[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.tone}`} role="status" aria-live="polite">
      <span className="toast__text">{toast.text}</span>
      {toast.action && (
        <button type="button" className="toast__action" onClick={toast.action.run}>
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast__close" onClick={onDismiss} aria-label="Dismiss">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
