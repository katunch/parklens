import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';

interface MenuProps {
  /** Render the trigger; spread the props onto a button. */
  trigger: (props: { 'aria-expanded': boolean; 'aria-controls': string; 'aria-haspopup': 'menu' | 'dialog'; onClick: () => void; ref: (el: HTMLButtonElement | null) => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  kind?: 'menu' | 'dialog';
  className?: string;
  label?: string;
}

/** Small popover (account menu, autopilot popover). Closes on outside click and Esc (focus returns). */
export function Menu({ trigger, children, align = 'end', kind = 'dialog', className, label }: MenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    const first = wrap.current?.querySelector<HTMLElement>('.menu a, .menu button, .menu [tabindex]');
    first?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };

  return (
    <div className={cx('menu-wrap', className)} ref={wrap}>
      {trigger({
        'aria-expanded': open,
        'aria-controls': id,
        'aria-haspopup': kind,
        onClick: () => setOpen((o) => !o),
        ref: (el) => {
          btn.current = el;
        },
      })}
      {open && (
        <div id={id} className={cx('menu', `menu--${align}`)} role={kind === 'menu' ? 'menu' : 'dialog'} aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
