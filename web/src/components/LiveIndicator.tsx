import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx';
import type { LiveStatus } from '../live/LiveProvider';

/** Green dot "Live", or amber pulsing dot while (re)connecting (UX §4.1). */
export function LiveIndicator({ status, dotOnly, className }: { status: LiveStatus; dotOnly?: boolean; className?: string }) {
  const { t } = useTranslation();
  const hintId = useId();
  const live = status === 'live';
  const label = live ? t('nav.live.connected') : status === 'connecting' ? t('nav.live.connecting') : t('nav.live.reconnecting');
  const hint = live ? undefined : t('nav.live.hintDisconnected');
  return (
    <span
      className={cx('live', live ? 'live--on' : 'live--off', dotOnly && 'live--dot-only', className)}
      title={hint ?? label}
      role={dotOnly ? 'img' : 'status'}
      aria-label={dotOnly ? label : undefined}
      aria-describedby={hint ? hintId : undefined}
    >
      <span className="live__dot" aria-hidden="true" />
      {!dotOnly && <span className="live__label">{label}</span>}
      {hint && (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      )}
    </span>
  );
}
