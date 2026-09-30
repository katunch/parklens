import { AnimatePresence, motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveSessions, useAlarms } from '../../../api/hooks';
import { AlarmTypeBadge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { ErrorState } from '../../../components/EmptyState';
import { Skeleton } from '../../../components/Misc';
import { PlateChip } from '../../../components/Plate';
import { useDossier } from '../../../dossier/PlateDossier';
import { minutesSince } from '../../../lib/format';
import { useNow } from '../../../lib/hooks';
import { formatPlate } from '../../../lib/plate';
import { useFmt } from '../../../lib/timezone';
import { useAlarmActions } from '../../../live/AlarmActions';
import { CountBadge } from '../../../components/Badge';
import { PanelLink, Instrument } from './shared';

/** Open alarms instrument (UX §5.6): red glass items, slide in on arrival, slide out right on resolve. */
export function OpenAlarms({ index }: { index: number }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const now = useNow();
  const alarms = useAlarms({ status: 'open', limit: 20 });
  const sessions = useActiveSessions();
  const { openResolve } = useAlarmActions();
  const dossier = useDossier();
  const items = alarms.data?.items.filter((a) => a.status === 'open') ?? [];

  const meta = (a: (typeof items)[number]) => {
    const session = sessions.data?.items.find((s) => s.id === a.sessionId);
    const time = fmt.timeOrDateTime(a.occurredAt);
    const gate = a.gateId ?? t('common.emptyValue');
    if (a.type === 'overstay') return t('dashboard.openAlarms.metaOverstay', { time, duration: fmt.duration(session ? minutesSince(session.enteredAt, now) : 0) });
    if (a.isStillParked && session) return t('dashboard.openAlarms.metaParked', { time, gate, duration: fmt.duration(minutesSince(session.enteredAt, now)) });
    return t('dashboard.openAlarms.meta', { time, gate });
  };

  return (
    <Instrument
      index={index}
      className="alarms"
      title={t('dashboard.openAlarms.title')}
      titleId="cc-alarms"
      after={<CountBadge count={items.length} tone="danger" />}
      meta={<PanelLink to="/admin/alarms?status=open">{t('common.actions.viewAll')}</PanelLink>}
    >
      {alarms.isError && !alarms.data ? (
        <ErrorState onRetry={() => void alarms.refetch()} />
      ) : !alarms.data ? (
        <div className="stack-md" aria-busy="true">
          <Skeleton height={64} />
        </div>
      ) : items.length === 0 ? (
        <div className="allclear">
          <span className="allclear__ring" aria-hidden="true">
            <ShieldCheck size={22} />
          </span>
          <strong className="allclear__title">{t('dashboard.openAlarms.emptyTitle')}</strong>
          <span className="caption">{t('dashboard.openAlarms.emptyBody')}</span>
        </div>
      ) : (
        <ul className="alarm-list">
          <AnimatePresence initial={false}>
            {items.map((a) => (
              <motion.li
                key={a.id}
                layout
                className="alarm-item"
                initial={{ opacity: 0, x: 16, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1, transition: { duration: 0.52, ease: [0.34, 1.56, 0.64, 1] } }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } }}
                transition={{ layout: { type: 'spring', stiffness: 500, damping: 40 } }}
              >
                <div className="alarm-item__top">
                  <PlateChip plate={a.plate} size="md" state="denied" onClick={() => dossier.open(a.plate)} ariaLabel={formatPlate(a.plate)} />
                  <AlarmTypeBadge type={a.type} />
                </div>
                <Button variant="primary" size="sm" onClick={() => openResolve(a)}>
                  {t('alarms.resolve')}
                  <span className="sr-only"> {formatPlate(a.plate)}</span>
                </Button>
                <div className="alarm-item__main">
                  <span className="alarm-item__meta">{meta(a)}</span>
                  {a.previousAlarmCount > 0 && <span className="alarm-item__prev">{t('alarms.previous', { count: a.previousAlarmCount })}</span>}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Instrument>
  );
}
