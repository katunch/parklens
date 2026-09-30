import {
  Ban,
  Car,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Siren,
  TimerOff,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlarmStatus, AlarmType, PermitStatus } from '../api/types';
import { cx } from '../lib/cx';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'live';

/** StatusBadge: icon + text, always both (UX §6). */
export function Badge({ tone, icon: Icon, children, className }: { tone: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cx('badge', `badge--${tone}`, className)}>
      {Icon && <Icon size={13} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

const PERMIT_STATUS: Record<PermitStatus, { tone: Tone; icon: LucideIcon }> = {
  pending: { tone: 'warning', icon: Clock },
  approved: { tone: 'success', icon: CircleCheck },
  rejected: { tone: 'neutral', icon: CircleX },
  revoked: { tone: 'neutral', icon: Ban },
};

export function PermitStatusBadge({ status }: { status: PermitStatus }) {
  const { t } = useTranslation();
  const s = PERMIT_STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(`common.permitStatus.${status}`)}
    </Badge>
  );
}

export function AlarmStatusBadge({ status }: { status: AlarmStatus }) {
  const { t } = useTranslation();
  return status === 'open' ? (
    <Badge tone="danger" icon={Siren}>
      {t('common.alarmStatus.open')}
    </Badge>
  ) : (
    <Badge tone="neutral" icon={Check}>
      {t('common.alarmStatus.resolved')}
    </Badge>
  );
}

export function AccessBadge({ authorized }: { authorized: boolean }) {
  const { t } = useTranslation();
  return authorized ? (
    <Badge tone="success" icon={ShieldCheck}>
      {t('common.access.authorized')}
    </Badge>
  ) : (
    <Badge tone="danger" icon={ShieldAlert}>
      {t('common.access.unauthorized')}
    </Badge>
  );
}

export function AlarmTypeBadge({ type }: { type: AlarmType }) {
  const { t } = useTranslation();
  return (
    <Badge tone="danger" icon={type === 'overstay' ? TimerOff : ShieldAlert}>
      {t(`common.alarmType.${type}`)}
    </Badge>
  );
}

export function NoPermitBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone="danger" icon={ShieldAlert}>
      {t('common.noPermit')}
    </Badge>
  );
}

export function StillParkedBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone="neutral" icon={Car}>
      {t('common.stillParked')}
    </Badge>
  );
}

/** "Valid today": success text with an 8px dot. */
export function ValidToday() {
  const { t } = useTranslation();
  return (
    <span className="valid-today">
      <span className="valid-today__dot" aria-hidden="true" />
      {t('common.validToday')}
    </span>
  );
}

/** Pill counter; hidden at 0; the number is aria-hidden (the parent carries the label). */
export function CountBadge({ count, tone, className }: { count: number | undefined; tone: 'danger' | 'warning' | 'neutral'; className?: string }) {
  const prev = useRef(count ?? 0);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    const c = count ?? 0;
    if (c > prev.current) {
      setBump(true);
      const id = window.setTimeout(() => setBump(false), 480);
      prev.current = c;
      return () => window.clearTimeout(id);
    }
    prev.current = c;
    return undefined;
  }, [count]);
  if (!count) return null;
  return (
    <span className={cx('count-badge', `count-badge--${tone}`, bump && 'bump', className)} aria-hidden="true">
      {count > 99 ? '99+' : count}
    </span>
  );
}
