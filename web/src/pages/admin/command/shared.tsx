import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../../../lib/cx';

/** Power-on sequence runs on the first command-center mount per session only (UX §13 #3). */
let booted = false;
export function consumeBoot(): boolean {
  if (booted) return false;
  booted = true;
  return true;
}

interface InstrumentProps {
  className?: string;
  title?: ReactNode;
  titleId?: string;
  meta?: ReactNode;
  after?: ReactNode;
  index: number;
  children: ReactNode;
  as?: 'article' | 'section';
}

/** Glass instrument: registration marks + cursor spotlight (UX §6 Panel / Instrument). */
export function Instrument({ className, title, titleId, meta, after, index, children, as: Tag = 'article' }: InstrumentProps) {
  return (
    <Tag className={cx('panel', 'instrument', 'spot', className)} style={{ '--i': index } as CSSProperties} aria-labelledby={titleId}>
      {title && (
        <div className="panel__head">
          <h2 className="panel__title" id={titleId}>
            {title}
          </h2>
          {after}
          {meta && <div className="panel__meta">{meta}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="panel__link">
      {children}
    </Link>
  );
}
