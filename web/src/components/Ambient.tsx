import { cx } from '../lib/cx';

/** Ambient background (UX §1.3): drifting light fields + blueprint grid, fixed behind the content. */
export function Ambient({ calm }: { calm?: boolean }) {
  return (
    <div className={cx('ambient', calm && 'ambient--calm')} aria-hidden="true">
      <div className="ambient__fields" />
      <div className="ambient__grid" />
    </div>
  );
}
