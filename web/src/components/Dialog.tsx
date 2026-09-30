import { X } from 'lucide-react';
import { useEffect, useId, useRef, type FormEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Lead text under the title; wired to aria-describedby. */
  description?: ReactNode;
  size?: 'sm' | 'md' | 'drawer';
  children?: ReactNode;
  footer?: ReactNode;
  /** While submitting, Esc / close / backdrop are blocked. */
  busy?: boolean;
  /** A backdrop click closes the dialog only when the form is not dirty. */
  dirty?: boolean;
  /** Element to focus on open (defaults to the first field in the body). */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Render the panel as a <form> (Enter submits). */
  onSubmit?: (e: FormEvent) => void;
  className?: string;
}

const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Native <dialog> + showModal(): focus trap, Esc and inert background for free (UX §6 Dialog).
 * Below 720px it is styled as a bottom sheet.
 */
export function Dialog({ open, onClose, title, description, size = 'md', children, footer, busy, dirty, initialFocus, onSubmit, className }: DialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const downOnBackdrop = useRef(false);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement;
      dlg.showModal();
      const target =
        initialFocus?.current ??
        bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        dlg.querySelector<HTMLElement>('.dialog__footer ' + FOCUSABLE);
      target?.focus();
    } else if (!open && dlg.open) {
      dlg.close();
    }
    if (!open) {
      const trigger = triggerRef.current;
      triggerRef.current = null;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    }
  }, [open]);

  // Restore focus if the component unmounts while open. (StrictMode's simulated unmount keeps the
  // <dialog> connected, so it is ignored.)
  useEffect(() => {
    const dlg = ref.current;
    return () => {
      if (dlg?.isConnected) return;
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement && trigger.isConnected) window.requestAnimationFrame(() => trigger.focus());
    };
  }, []);

  const requestClose = () => {
    if (!busy) onClose();
  };

  const Panel = onSubmit ? 'form' : 'div';

  return (
    <dialog
      ref={ref}
      className={cx('dialog', `dialog--${size}`, className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current && !dirty) requestClose();
        downOnBackdrop.current = false;
      }}
    >
      {open && (
        <Panel className="dialog__panel" onSubmit={onSubmit} noValidate={onSubmit ? true : undefined}>
          <header className="dialog__header">
            <h2 id={titleId} className="dialog__title">
              {title}
            </h2>
            <button type="button" className="btn btn--ghost btn--sm btn--icon dialog__close" aria-label={t('common.actions.close')} onClick={requestClose} disabled={busy}>
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="dialog__body" ref={bodyRef}>
            {description && (
              <div id={descId} className="dialog__lead">
                {description}
              </div>
            )}
            {children}
          </div>
          {footer && <footer className="dialog__footer">{footer}</footer>}
        </Panel>
      )}
    </dialog>
  );
}
