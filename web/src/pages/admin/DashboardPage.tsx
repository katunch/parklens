import { useQuery } from '@tanstack/react-query';
import { Car, CircleCheck, Clock, Inbox, LogIn, LogOut, ScanLine, ShieldAlert, Siren } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api, qk } from '../../api/endpoints';
import { useAlarms, useGateEvents, usePermits, useSummary } from '../../api/hooks';
import type { DashboardSummary } from '../../api/types';
import { AccessBadge, AlarmTypeBadge, NoPermitBadge, StillParkedBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { InlineAlert } from '../../components/InlineAlert';
import { Duration, PageHeader, RelativeTime, Skeleton } from '../../components/Misc';
import { Panel } from '../../components/Panel';
import { PlateChip } from '../../components/Plate';
import { QueryBody } from '../../components/QueryBody';
import { cx } from '../../lib/cx';
import { useFresh } from '../../lib/fresh';
import { useDelayedFlag, useNow } from '../../lib/hooks';
import { formatPlate } from '../../lib/plate';
import { sortParked } from '../../lib/sessions';
import { useFmt } from '../../lib/timezone';
import { useAlarmActions } from '../../live/AlarmActions';

export default function DashboardPage() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const now = useNow();
  return (
    <div className="page dashboard">
      <PageHeader title={t('dashboard.title')} sub={t('dashboard.today', { date: fmt.dateWeekday(now.toISOString()) })} />
      <KpiStrip />
      <div className="dashboard__grid">
        <div className="dashboard__col dashboard__col--main">
          <OpenAlarmsPanel />
          <RecentEventsPanel />
        </div>
        <div className="dashboard__col dashboard__col--side">
          <ParkedNowPanel />
          <PendingRequestsPanel />
        </div>
      </div>
    </div>
  );
}

function KpiStrip() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const summary = useSummary();
  const showSkeleton = useDelayedFlag(summary.isPending);
  const s: DashboardSummary | undefined = summary.data;
  const failed = summary.isError && !s;

  const value = (n: number | undefined) =>
    s ? fmt.number(n ?? 0) : failed ? t('common.emptyValue') : showSkeleton ? <Skeleton width={48} height={36} /> : ' ';

  const alarmAlert = (s?.openAlarms ?? 0) > 0;
  const pendingAlert = (s?.pendingRequests ?? 0) > 0;

  return (
    <div className="kpi-strip-wrap">
      <div className={cx('kpi-strip', alarmAlert && 'kpi-strip--alarm')}>
        <Link to="/admin/alarms" className={cx('kpi', 'kpi--alarms', alarmAlert && 'kpi--danger')}>
          <span className="kpi__label">{t('dashboard.kpi.openAlarms')}</span>
          <span className="kpi__value-row">
            <span className="kpi__value">{value(s?.openAlarms)}</span>
            {alarmAlert && <Siren size={24} aria-hidden="true" className="kpi__icon" />}
          </span>
          <span className="kpi__link">{t('dashboard.kpi.viewAlarms')}</span>
        </Link>
        <Link to="/admin/activity" className="kpi">
          <span className="kpi__label">{t('dashboard.kpi.parkedNow')}</span>
          <span className="kpi__value-row">
            <span className="kpi__value">{value(s?.parkedNow)}</span>
          </span>
          {s && (
            <span className={cx('kpi__secondary', s.parkedUnauthorized > 0 && 'kpi__secondary--danger')}>
              {s.parkedUnauthorized > 0 ? (
                <>
                  <ShieldAlert size={14} aria-hidden="true" />
                  {t('dashboard.kpi.parkedUnauthorized', { count: s.parkedUnauthorized })}
                </>
              ) : (
                t('dashboard.kpi.allParkedAuthorized')
              )}
            </span>
          )}
          <span className="kpi__link">{t('dashboard.kpi.viewParked')}</span>
        </Link>
        <Link to="/admin/requests" className={cx('kpi', pendingAlert && 'kpi--warning')}>
          <span className="kpi__label">{t('dashboard.kpi.pendingRequests')}</span>
          <span className="kpi__value-row">
            <span className="kpi__value">{value(s?.pendingRequests)}</span>
            {pendingAlert && <Clock size={24} aria-hidden="true" className="kpi__icon" />}
          </span>
          <span className="kpi__link">{t('dashboard.kpi.reviewRequests')}</span>
        </Link>
        <Link to="/admin/activity?tab=log" className="kpi">
          <span className="kpi__label">{t('dashboard.kpi.entriesToday')}</span>
          <span className="kpi__value-row">
            <span className="kpi__value">{value(s?.entriesToday)}</span>
          </span>
          <span className="kpi__link">{t('dashboard.kpi.viewLog')}</span>
        </Link>
        <Link to="/admin/permits?activeToday=true&status=approved" className="kpi">
          <span className="kpi__label">{t('dashboard.kpi.activePermitsToday')}</span>
          <span className="kpi__value-row">
            <span className="kpi__value">{value(s?.activePermitsToday)}</span>
          </span>
          <span className="kpi__link">{t('dashboard.kpi.viewPermits')}</span>
        </Link>
      </div>
      {failed && (
        <InlineAlert
          tone="danger"
          size="sm"
          action={
            <Button size="sm" onClick={() => void summary.refetch()} loading={summary.isFetching}>
              {t('common.actions.tryAgain')}
            </Button>
          }
        >
          {t('errors.loadFailedTitle')}
        </InlineAlert>
      )}
    </div>
  );
}

function ViewAll({ to }: { to: string }) {
  const { t } = useTranslation();
  return (
    <Link to={to} className="panel-link">
      {t('common.actions.viewAll')}
    </Link>
  );
}

function OpenAlarmsPanel() {
  const { t } = useTranslation();
  const query = useAlarms({ status: 'open', limit: 5 });
  const isFresh = useFresh();
  const { openResolve } = useAlarmActions();
  return (
    <Panel title={t('dashboard.openAlarms.title')} action={<ViewAll to="/admin/alarms" />} flush className="dash-alarms">
      <QueryBody
        query={query}
        empty={<EmptyState icon={CircleCheck} tone="success" title={t('dashboard.openAlarms.emptyTitle')} body={t('dashboard.openAlarms.emptyBody')} />}
      >
        {(items) => (
          <ul className="list">
            {items.map((a) => (
              <li key={a.id} className={cx('list-row', 'alarm-row', isFresh(a.id) && 'is-fresh')}>
                <div className="list-row__main">
                  <div className="list-row__line">
                    <PlateChip plate={a.plate} size="md" />
                    <AlarmTypeBadge type={a.type} />
                    <RelativeTime iso={a.occurredAt} className="muted" />
                  </div>
                  <div className="list-row__line list-row__line--meta">
                    {a.gateId && (
                      <span className="muted">
                        {t('common.fields.gate')} {a.gateId}
                      </span>
                    )}
                    {a.isStillParked && <StillParkedBadge />}
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => openResolve(a)}>
                  {t('alarms.resolve')}
                  <span className="sr-only"> {formatPlate(a.plate)}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryBody>
    </Panel>
  );
}

function ParkedNowPanel() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: qk.sessions({ active: true, limit: 10 }), queryFn: () => api.sessions({ active: true, limit: 10 }) });
  const isFresh = useFresh();
  return (
    <Panel title={t('dashboard.parkedNow.title')} action={<ViewAll to="/admin/activity" />} flush className="dash-parked">
      <QueryBody query={query} empty={<EmptyState icon={Car} title={t('dashboard.parkedNow.emptyTitle')} body={t('dashboard.parkedNow.emptyBody')} />}>
        {(items) => (
          <ul className="list">
            {sortParked(items).map((s) => (
              <li key={s.id} className={cx('list-row', isFresh(s.id) && 'is-fresh')}>
                <div className="list-row__main">
                  <div className="list-row__line">
                    <PlateChip plate={s.plate} size="md" />
                    {s.permit ? (
                      <span className="list-row__text">
                        {s.permit.holderName}
                        <span className="muted">, {t(`common.permitType.${s.permit.type}`)}</span>
                      </span>
                    ) : (
                      <NoPermitBadge />
                    )}
                  </div>
                  {s.openAlarmId && (
                    <Link to={`/admin/alarms?focus=${s.openAlarmId}`} className="link-danger text-sm">
                      {t('activity.openAlarm')}
                    </Link>
                  )}
                </div>
                <span className="list-row__end tabular">
                  <Duration since={s.enteredAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryBody>
    </Panel>
  );
}

function RecentEventsPanel() {
  const { t } = useTranslation();
  const query = useGateEvents({ limit: 8 });
  const isFresh = useFresh();
  return (
    <Panel title={t('dashboard.recentEvents.title')} action={<ViewAll to="/admin/activity?tab=log" />} flush className="dash-events">
      <QueryBody
        query={query}
        empty={<EmptyState icon={ScanLine} title={t('dashboard.recentEvents.emptyTitle')} body={t('dashboard.recentEvents.emptyBody')} />}
      >
        {(items) => (
          <ul className="list">
            {items.map((e) => {
              const formatted = formatPlate(e.plate);
              const raw = e.plateRaw.trim();
              return (
                <li key={e.id} className={cx('list-row', 'event-row', isFresh(e.id) && 'is-fresh')}>
                  <RelativeTime iso={e.occurredAt} className="event-row__time muted" />
                  <span className="event-row__dir">
                    {e.direction === 'in' ? <LogIn size={16} aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
                    {t(`common.direction.${e.direction}`)}
                  </span>
                  <PlateChip plate={e.plate} size="sm" title={raw && raw !== formatted ? t('activity.cameraRead', { raw }) : undefined} />
                  {e.direction === 'in' && e.authorized !== null && <AccessBadge authorized={e.authorized} />}
                  {e.permit && <span className="muted event-row__holder">{e.permit.holderName}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </QueryBody>
    </Panel>
  );
}

function PendingRequestsPanel() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const query = usePermits({ status: 'pending', limit: 5 });
  const isFresh = useFresh();
  return (
    <Panel title={t('dashboard.pendingRequests.title')} action={<ViewAll to="/admin/requests" />} flush className="dash-pending">
      <QueryBody
        query={query}
        empty={<EmptyState icon={Inbox} title={t('dashboard.pendingRequests.emptyTitle')} body={t('dashboard.pendingRequests.emptyBody')} />}
      >
        {(items) => (
          <ul className="list">
            {items.map((p) => (
              <li key={p.id} className={cx('list-row', 'list-row--link', isFresh(p.id) && 'is-fresh')}>
                <Link to="/admin/requests" className="list-row__cover">
                  <div className="list-row__main">
                    <div className="list-row__line">
                      <PlateChip display={p.plateDisplay} plate={p.plate} size="md" />
                      <span className="list-row__text strong">{p.holderName}</span>
                    </div>
                    <div className="list-row__line list-row__line--meta">
                      <span className="muted">
                        {p.type === 'daily' && p.validDate
                          ? t('common.permitDailyOn', { date: fmt.calDateWeekday(p.validDate) })
                          : t('common.permitTypeLong.permanent')}
                      </span>
                    </div>
                  </div>
                  <RelativeTime iso={p.createdAt} className="muted list-row__end" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryBody>
    </Panel>
  );
}
