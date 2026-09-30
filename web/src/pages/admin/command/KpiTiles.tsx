import { BadgeCheck, Car, Inbox, LogIn, Siren, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { usePermits, usePermitsToday, useSummary, useTimeline } from '../../../api/hooks';
import { CountUp } from '../../../components/CountUp';
import { Skeleton } from '../../../components/Misc';
import { Sparkline } from '../../../components/Sparkline';
import { cx } from '../../../lib/cx';
import { useNow } from '../../../lib/hooks';
import { currentBucketIndex, sparkSeries, timelineTotals, withLiveOccupancy } from '../../../lib/timeline';
import { useFmt } from '../../../lib/timezone';
import { useOccupancy } from '../../../live/useOccupancy';

interface TileProps {
  index: number;
  to: string;
  label: string;
  icon: LucideIcon;
  value: number | undefined;
  unit?: string;
  sub?: ReactNode;
  subDanger?: boolean;
  spark?: { values: number[]; color: string };
  alarm?: boolean;
  warn?: boolean;
  booting: boolean;
}

function KpiTile({ index, to, label, icon: Icon, value, unit, sub, subDanger, spark, alarm, warn, booting }: TileProps) {
  return (
    <Link to={to} className={cx('panel instrument spot kpi', alarm && 'kpi--alarm', warn && 'kpi--warn')} style={{ '--i': index } as CSSProperties}>
      <span className="kpi__label">
        {alarm ? <i className="dot dot--danger" aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
        <span className="kpi__label-text">{label}</span>
      </span>
      <span className="kpi__value">
        {value === undefined ? <Skeleton width={56} height={32} /> : <CountUp value={value} delay={booting ? 200 + index * 90 : 0} />}
        {unit && value !== undefined && <span className="kpi__unit">{unit}</span>}
      </span>
      <span className={cx('kpi__sub', subDanger && 'kpi__sub--danger')}>{sub ?? ' '}</span>
      {spark && <Sparkline values={spark.values} color={spark.color} animate={booting} delay={250 + index * 90} />}
    </Link>
  );
}

/** Five KPI tiles (UX §5.6). Parked now uses the shared occupancy source. */
export function KpiTiles({ booting }: { booting: boolean }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const now = useNow();
  const summary = useSummary();
  const timeline = useTimeline();
  const { occupancy: o } = useOccupancy();
  const oldest = usePermits({ status: 'pending', limit: 1 });
  const today = usePermitsToday();
  const s = summary.data;
  const buckets = timeline.data ? withLiveOccupancy(timeline.data.buckets, now, o?.parked) : undefined;
  const totals = buckets ? timelineTotals(buckets) : undefined;
  const cur = buckets ? currentBucketIndex(buckets, now) : -1;
  const permanent = today.data?.items.filter((p) => p.type === 'permanent').length;
  const daily = today.data?.items.filter((p) => p.type === 'daily').length;
  const oldestAt = oldest.data?.items[0]?.createdAt;

  return (
    <div className="kpis" style={{ '--i': 0 } as CSSProperties}>
      <KpiTile
        index={0}
        booting={booting}
        to="/admin/alarms?status=open"
        label={t('dashboard.kpi.openAlarms')}
        icon={Siren}
        value={s?.openAlarms}
        alarm={(s?.openAlarms ?? 0) > 0}
        sub={totals ? t('dashboard.kpi.deniedToday', { count: totals.denied }) : undefined}
        spark={buckets ? { values: sparkSeries(buckets, 'denied', now), color: 'var(--chart-denied)' } : undefined}
      />
      <KpiTile
        index={1}
        booting={booting}
        to="/admin/activity"
        label={t('dashboard.kpi.parkedNow')}
        icon={Car}
        value={o?.parked}
        unit={o ? t('dashboard.kpi.capacityUnit', { capacity: fmt.number(o.capacity) }) : undefined}
        sub={o ? (o.unauthorized > 0 ? t('dashboard.kpi.parkedUnauthorized', { count: o.unauthorized }) : t('dashboard.kpi.allParkedAuthorized')) : undefined}
        subDanger={(o?.unauthorized ?? 0) > 0}
        spark={buckets ? { values: sparkSeries(buckets, 'occupancy', now), color: 'var(--chart-occupancy)' } : undefined}
      />
      <KpiTile
        index={2}
        booting={booting}
        to="/admin/activity?tab=log"
        label={t('dashboard.kpi.entriesToday')}
        icon={LogIn}
        value={s?.entriesToday}
        sub={buckets && cur >= 0 ? t('dashboard.kpi.entriesThisHour', { count: buckets[cur]!.entries }) : undefined}
        spark={buckets ? { values: sparkSeries(buckets, 'entries', now), color: 'var(--chart-entries)' } : undefined}
      />
      <KpiTile
        index={3}
        booting={booting}
        to="/admin/requests"
        label={t('dashboard.kpi.pendingRequests')}
        icon={Inbox}
        value={s?.pendingRequests}
        warn={(s?.pendingRequests ?? 0) > 0}
        sub={(s?.pendingRequests ?? 0) > 0 && oldestAt ? t('dashboard.kpi.oldestRequest', { time: fmt.relative(oldestAt, now, true) }) : undefined}
      />
      <KpiTile
        index={4}
        booting={booting}
        to="/admin/permits?activeToday=true&status=approved"
        label={t('dashboard.kpi.activePermitsToday')}
        icon={BadgeCheck}
        value={s?.activePermitsToday}
        sub={permanent !== undefined && daily !== undefined ? t('dashboard.kpi.permitsBreakdown', { permanent, daily }) : undefined}
      />
    </div>
  );
}
