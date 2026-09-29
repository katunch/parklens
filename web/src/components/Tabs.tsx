import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/cx';
import { CountBadge } from './Badge';

export interface TabItem {
  key: string;
  to: string;
  label: ReactNode;
  active: boolean;
  count?: number;
  countTone?: 'danger' | 'warning' | 'neutral';
  /** Accessible text for the count, e.g. "1 open alarm". */
  countLabel?: string;
}

/** URL-driven tabs: links in a nav with aria-current (not ARIA tabs). */
export function Tabs({ label, items, className }: { label: string; items: TabItem[]; className?: string }) {
  return (
    <nav aria-label={label} className={cx('tabs', className)}>
      <ul className="tabs__list">
        {items.map((i) => (
          <li key={i.key}>
            <Link to={i.to} className={cx('tabs__tab', i.active && 'is-active')} aria-current={i.active ? 'page' : undefined}>
              <span>{i.label}</span>
              {i.count !== undefined && i.countTone && <CountBadge count={i.count} tone={i.countTone} />}
              {i.countLabel && i.count ? <span className="sr-only">, {i.countLabel}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
