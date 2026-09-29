import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastInput {
  tone: ToastTone;
  message: ReactNode;
  action?: { label: string; to?: string; onClick?: () => void };
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const ICONS = { success: CircleCheck, info: Info, warning: TriangleAlert, danger: CircleAlert } as const;
const MAX = 3;

let nextId = 1;

/** Toast stack (UX §2.6): max 3, newest on top; 5 s (8 s for errors); hover/focus pauses. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const regionRef = useRef<HTMLDivElement>(null);

  const push = useCallback((t: ToastInput) => {
    setToasts((prev) => [{ ...t, id: nextId++ }, ...prev].slice(0, MAX));
  }, []);
  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  // The region is a manual popover so it sits in the top layer, above open modal dialogs.
  // Re-showing it moves it above a dialog that was opened after it.
  useLayoutEffect(() => {
    const el = regionRef.current;
    if (!el || typeof el.showPopover !== 'function') return;
    try {
      if (el.matches(':popover-open')) el.hidePopover();
      if (toasts.length > 0) el.showPopover();
    } catch {
      /* popover unsupported: falls back to z-index */
    }
  }, [toasts]);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div ref={regionRef} className="toast-region" popover="manual">
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.tone === 'danger' ? 8000 : 5000);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const id = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current = Math.max(1000, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, onDismiss]);

  const Icon = ICONS[toast.tone];
  return (
    <div
      className={`toast toast--${toast.tone}`}
      role={toast.tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon size={20} aria-hidden="true" className="toast__icon" />
      <div className="toast__content">
        <div className="toast__message">{toast.message}</div>
        {toast.action &&
          (toast.action.to ? (
            <Link
              to={toast.action.to}
              className="toast__action"
              onClick={() => {
                toast.action?.onClick?.();
                onDismiss();
              }}
            >
              {toast.action.label}
            </Link>
          ) : (
            <button
              type="button"
              className="toast__action toast__action--button"
              onClick={() => {
                toast.action?.onClick?.();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          ))}
      </div>
      <button type="button" className="btn btn--ghost btn--sm btn--icon toast__close" aria-label={t('common.actions.close')} onClick={onDismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
