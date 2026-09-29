import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert } as const;

interface InlineAlertProps {
  tone: AlertTone;
  children: ReactNode;
  title?: ReactNode;
  size?: 'sm' | 'md';
  action?: ReactNode;
  /** `alert` only for errors that appear after a submit. */
  role?: 'alert' | 'status';
  id?: string;
  className?: string;
}

export function InlineAlert({ tone, children, title, size = 'md', action, role, id, className }: InlineAlertProps) {
  const Icon = ICONS[tone];
  return (
    <div id={id} className={cx('alert', `alert--${tone}`, size === 'sm' && 'alert--sm', className)} role={role}>
      <Icon size={size === 'sm' ? 16 : 18} aria-hidden="true" className="alert__icon" />
      <div className="alert__content">
        {title && <p className="alert__title">{title}</p>}
        <div className="alert__text">{children}</div>
        {action && <div className="alert__action">{action}</div>}
      </div>
    </div>
  );
}
