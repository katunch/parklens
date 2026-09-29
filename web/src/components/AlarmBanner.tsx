import { Siren, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useAlarms } from '../api/hooks';
import { useAlarmActions } from '../live/AlarmActions';
import { STORAGE_KEYS, storage } from '../lib/storage';
import { useFmt } from '../lib/timezone';
import { Button } from './Button';
import { PlateChip } from './Plate';

/**
 * Global red banner (UX §4.2): open alarms minus the ones dismissed in this browser session.
 * Shows the newest; hidden on /admin/alarms.
 */
export function AlarmBanner() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const location = useLocation();
  const { openResolve } = useAlarmActions();
  const { data } = useAlarms({ status: 'open', limit: 20 });
  const [dismissed, setDismissed] = useState<string[]>(() => storage.session.getJson<string[]>(STORAGE_KEYS.dismissedAlarms, []));

  if (location.pathname.startsWith('/admin/alarms')) return null;
  const visible = (data?.items ?? []).filter((a) => a.status === 'open' && !dismissed.includes(a.id));
  const alarm = visible[0];
  if (!alarm) return null;

  const dismiss = () => {
    const next = [...new Set([...dismissed, alarm.id])].slice(-200);
    storage.session.setJson(STORAGE_KEYS.dismissedAlarms, next);
    setDismissed(next);
  };

  const time = fmt.timeOrDateTime(alarm.occurredAt);
  const meta = alarm.gateId ? t('alarms.banner.meta', { time, gate: alarm.gateId }) : t('alarms.banner.metaNoGate', { time });
  const more = visible.length - 1;

  return (
    <section className="alarm-banner" aria-label={t('alarms.banner.regionLabel')} key={alarm.id}>
      <Siren size={24} className="alarm-banner__icon" aria-hidden="true" />
      <p className="alarm-banner__title">{t(`alarms.banner.title.${alarm.type}`)}</p>
      <div className="alarm-banner__info">
        <PlateChip plate={alarm.plate} size="md" srPrefix />
        <time className="alarm-banner__meta" dateTime={alarm.occurredAt} title={fmt.dateTime(alarm.occurredAt)}>
          {meta}
        </time>
      </div>
      {more > 0 && (
        <Link to="/admin/alarms?status=open" className="alarm-banner__more">
          {t('alarms.banner.more', { count: more })}
        </Link>
      )}
      <div className="alarm-banner__actions">
        <Button variant="inverse" size="sm" onClick={() => openResolve(alarm)}>
          {t('alarms.banner.resolve')}
        </Button>
        <Link to={`/admin/alarms?status=open&focus=${alarm.id}`} className="alarm-banner__view">
          {t('alarms.banner.view')}
        </Link>
      </div>
      <button type="button" className="alarm-banner__dismiss" aria-label={t('alarms.banner.dismiss')} onClick={dismiss}>
        <X size={20} aria-hidden="true" />
      </button>
    </section>
  );
}
