import { useId, type ReactNode } from 'react';
import { cx } from '../lib/cx';

interface PanelProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** No body padding (tables, lists). */
  flush?: boolean;
  className?: string;
  as?: 'section' | 'div';
  headerExtra?: ReactNode;
}

/** White surface, 1px border, no shadow (UX §6 Panel). */
export function Panel({ title, action, children, flush, className, as: Tag = 'section', headerExtra }: PanelProps) {
  const id = useId();
  return (
    <Tag className={cx('panel', className)} aria-labelledby={title ? id : undefined}>
      {title && (
        <header className="panel__header">
          <div className="panel__heading">
            <h2 id={id} className="panel__title">
              {title}
            </h2>
            {headerExtra}
          </div>
          {action && <div className="panel__action">{action}</div>}
        </header>
      )}
      <div className={cx('panel__body', flush && 'panel__body--flush')}>{children}</div>
    </Tag>
  );
}
