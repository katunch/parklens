import { CircleCheck, Siren } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAlarms, useSummary } from '../../api/hooks';
import type { Alarm, AlarmStatus } from '../../api/types';
import { AlarmStatusBadge, AlarmTypeBadge, StillParkedBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { PageHeader, RelativeTime } from '../../components/Misc';
import { Pagination } from '../../components/Pagination';
import { Panel } from '../../components/Panel';
import { PlateChip } from '../../components/Plate';
import { ResponsiveTable, type Column } from '../../components/ResponsiveTable';
import { SearchField } from '../../components/SearchField';
import { Tabs } from '../../components/Tabs';
import { WebhookStatusIcon } from '../../components/WebhookStatusIcon';
import { cx } from '../../lib/cx';
import { markFresh, useFresh } from '../../lib/fresh';
import { usePrefersReducedMotion } from '../../lib/hooks';
import { formatPlate } from '../../lib/plate';
import { useFmt } from '../../lib/timezone';
import { PAGE_SIZE, useUrlState } from '../../lib/urlState';
import { useAlarmActions } from '../../live/AlarmActions';
import { useDossier } from '../../dossier/PlateDossier';

type StatusFilter = AlarmStatus | 'all';

function ResolutionNote({ note }: { note: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button type="button" className={cx('note-clamp', expanded && 'is-expanded')} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
      «{note}»
    </button>
  );
}

function PlateCell({ alarm }: { alarm: Alarm }) {
  const { t } = useTranslation();
  const dossier = useDossier();
  return (
    <div className="stack-xs">
      <PlateChip plate={alarm.plate} size="md" state={alarm.status === 'open' ? 'denied' : undefined} onClick={() => dossier.open(alarm.plate)} ariaLabel={t('dossier.label', { plate: formatPlate(alarm.plate) })} />
      {alarm.previousAlarmCount > 0 && <span className="text-warning text-sm">{t('alarms.previous', { count: alarm.previousAlarmCount })}</span>}
      <Link to={`/admin/activity?tab=log&plate=${encodeURIComponent(alarm.plate)}`} className="text-sm">
        {t('alarms.plateHistory')}
      </Link>
    </div>
  );
}

function StatusCell({ alarm }: { alarm: Alarm }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  return (
    <div className="stack-xs">
      <div className="inline-badges">
        <AlarmStatusBadge status={alarm.status} />
        {alarm.status === 'open' && alarm.isStillParked && <StillParkedBadge />}
      </div>
      {alarm.status === 'resolved' && (
        <>
          <span className="text-sm muted">
            {t('alarms.resolvedBy', {
              name: alarm.resolvedByName ?? t('common.emptyValue'),
              time: alarm.resolvedAt ? fmt.dateTime(alarm.resolvedAt) : t('common.emptyValue'),
            })}
          </span>
          {alarm.resolutionNote && <ResolutionNote note={alarm.resolutionNote} />}
        </>
      )}
    </div>
  );
}

/** `/admin/alarms` – alarm list with tabs, plate search and resolve (UX §5.7). */
export default function AlarmsPage() {
  const { t } = useTranslation();
  const url = useUrlState();
  const summary = useSummary();
  const isFresh = useFresh();
  const reducedMotion = usePrefersReducedMotion();
  const { openResolve } = useAlarmActions();
  const dossier = useDossier();

  const statusParam = url.get('status', 'open');
  const status: StatusFilter = statusParam === 'resolved' || statusParam === 'all' ? statusParam : 'open';
  const plate = url.get('plate');
  const focus = url.get('focus');

  const query = useAlarms({ status, plate: plate || undefined, limit: PAGE_SIZE, offset: url.offset });
  const rows = query.data?.items;

  // ?focus=<id>: highlight and scroll to the row once it is rendered (UX §4.4).
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || !rows || focusedRef.current === focus) return;
    if (!rows.some((a) => a.id === focus)) return;
    focusedRef.current = focus;
    markFresh(focus);
    window.requestAnimationFrame(() => {
      document.getElementById(`alarm-${focus}`)?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }, [focus, rows, reducedMotion]);

  const tabTo = (s: StatusFilter) => {
    const p = new URLSearchParams();
    if (s !== 'open') p.set('status', s);
    if (plate) p.set('plate', plate);
    const qs = p.toString();
    return qs ? `?${qs}` : '?';
  };

  const resolveButton = (a: Alarm, block?: boolean) =>
    a.status === 'open' ? (
      <Button variant="primary" size="sm" block={block} onClick={() => openResolve(a)}>
        {t('alarms.resolve')}
        <span className="sr-only"> {formatPlate(a.plate)}</span>
      </Button>
    ) : null;

  const columns: Array<Column<Alarm>> = [
    { key: 'plate', header: t('common.fields.plate'), cell: (a) => <PlateCell alarm={a} />, width: '11rem' },
    {
      key: 'type',
      header: t('common.fields.alarm'),
      cell: (a) => (
        <div className="stack-xs">
          <AlarmTypeBadge type={a.type} />
          <span className="text-sm muted">{t(`common.alarmTypeLong.${a.type}`)}</span>
        </div>
      ),
    },
    { key: 'time', header: t('common.fields.time'), cell: (a) => <RelativeTime iso={a.occurredAt} className="tabular" /> },
    { key: 'gate', header: t('common.fields.gate'), cell: (a) => a.gateId ?? t('common.emptyValue') },
    { key: 'status', header: t('common.fields.status'), cell: (a) => <StatusCell alarm={a} /> },
    { key: 'webhook', header: t('common.fields.notification'), cell: (a) => <WebhookStatusIcon status={a.webhookStatus} error={a.webhookError} /> },
    { key: 'actions', header: t('common.fields.actions'), headerHidden: true, cell: (a) => resolveButton(a), align: 'end' },
  ];

  const renderCard = (a: Alarm) => (
    <>
      <div className="card-row__top">
        <PlateChip plate={a.plate} size="md" state={a.status === 'open' ? 'denied' : undefined} onClick={() => dossier.open(a.plate)} />
        <AlarmStatusBadge status={a.status} />
      </div>
      <div className="card-row__body">
        <AlarmTypeBadge type={a.type} /> <span className="text-sm">{t(`common.alarmTypeLong.${a.type}`)}</span>
      </div>
      <div className="card-row__meta">
        <RelativeTime iso={a.occurredAt} />
        {a.gateId && (
          <span>
            {t('common.fields.gate')} {a.gateId}
          </span>
        )}
        {/* A bare dash reads as a stray glyph on a card; "skipped" only shows in the table column. */}
        {a.webhookStatus !== 'skipped' && <WebhookStatusIcon status={a.webhookStatus} error={a.webhookError} />}
      </div>
      <div className="card-row__body inline-badges">
        {a.status === 'open' && a.isStillParked && <StillParkedBadge />}
        {a.previousAlarmCount > 0 && <span className="text-warning text-sm">{t('alarms.previous', { count: a.previousAlarmCount })}</span>}
        <Link to={`/admin/activity?tab=log&plate=${encodeURIComponent(a.plate)}`} className="text-sm">
          {t('alarms.plateHistory')}
        </Link>
      </div>
      {a.status === 'resolved' && (
        <div className="card-row__body">
          <StatusCell alarm={a} />
        </div>
      )}
      {a.status === 'open' && <div className="card-row__action">{resolveButton(a, true)}</div>}
    </>
  );

  const empty = plate ? (
    <EmptyState
      icon={Siren}
      title={t('alarms.empty.searchTitle', { plate })}
      body={t('alarms.empty.searchBody')}
      action={
        <Button size="sm" onClick={() => url.update({ plate: null })}>
          {t('common.actions.clearFilters')}
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={status === 'open' ? CircleCheck : Siren}
      tone={status === 'open' ? 'success' : 'default'}
      title={t(`alarms.empty.${status}Title`)}
      body={t(`alarms.empty.${status}Body`)}
    />
  );

  return (
    <div className="page">
      <PageHeader title={t('alarms.title')} />
      <div className="toolbar">
        <Tabs
          label={t('alarms.title')}
          items={[
            {
              key: 'open',
              to: tabTo('open'),
              label: t('alarms.tabs.open'),
              active: status === 'open',
              count: summary.data?.openAlarms,
              countTone: 'danger',
              countLabel: summary.data?.openAlarms ? t('nav.openAlarms', { count: summary.data.openAlarms }) : undefined,
            },
            { key: 'resolved', to: tabTo('resolved'), label: t('alarms.tabs.resolved'), active: status === 'resolved' },
            { key: 'all', to: tabTo('all'), label: t('alarms.tabs.all'), active: status === 'all' },
          ]}
        />
        <SearchField
          id="alarms-search"
          label={t('alarms.searchLabel')}
          placeholder={t('alarms.searchPlaceholder')}
          value={plate}
          onSearch={(v) => url.update({ plate: v.trim() || null }, { replace: true })}
          className="toolbar__search"
        />
      </div>
      <Panel flush>
        <ResponsiveTable
          caption={t('alarms.title')}
          columns={columns}
          rows={rows}
          rowKey={(a) => a.id}
          rowId={(a) => `alarm-${a.id}`}
          rowClassName={(a) => cx(isFresh(a.id) && 'is-fresh', a.status === 'open' && 'row--open')}
          loading={query.isPending}
          error={query.isError && !query.data ? <ErrorState onRetry={() => void query.refetch()} retrying={query.isFetching} /> : undefined}
          empty={empty}
          renderCard={renderCard}
        />
      </Panel>
      {query.data && <Pagination total={query.data.total} limit={PAGE_SIZE} offset={url.offset} onOffsetChange={url.setOffset} />}
    </div>
  );
}
