import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';

interface TooltipProps {
  /** The element the tooltip belongs to (null = hidden). */
  anchor: HTMLElement | null;
  id: string;
  children: ReactNode;
}

/**
 * Dark accent tooltip (UX §6 Tooltip): above the target, flips below with < 52px of room, clamped
 * 8px from the edges; `role="tooltip"`, referenced by the anchor's aria-describedby.
 */
export function Tooltip({ anchor, id, children }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) {
      setPos(null);
      return;
    }
    const r = anchor.getBoundingClientRect();
    const tw = ref.current.offsetWidth;
    const th = ref.current.offsetHeight;
    const x = Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2));
    const y = r.top - th - 10 < 52 ? r.bottom + 10 : r.top - th - 10;
    setPos({ x, y });
  }, [anchor, children]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className={cx('tip', anchor && pos && 'is-on')}
      style={pos ? { left: pos.x, top: pos.y } : { left: -9999, top: -9999 }}
      aria-hidden={anchor ? undefined : true}
    >
      {anchor ? children : null}
    </div>,
    document.body,
  );
}
