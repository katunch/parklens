import { Car, LogIn, LogOut, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useGateEvents, useSessions } from '../../api/hooks';
import type { Direction, GateEvent, ParkingSession } from '../../api/types';
import { AccessBadge, NoPermitBadge } from '../../components/Badge';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { Select } from '../../components/Field';
import { Duration, PageHeader, RelativeTime } from '../../components/Misc';
import { Pagination } from '../../components/Pagination';
import { Panel } from '../../components/Panel';
import { PlateChip } from '../../components/Plate';
import { ResponsiveTable, type Column } from '../../components/ResponsiveTable';
import { SearchField } from '../../components/SearchField';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Tabs } from '../../components/Tabs';
import { cx } from '../../lib/cx';
import { useFresh } from '../../lib/fresh';
import { formatPlate } from '../../lib/plate';
import { PAGE_SIZE, useUrlState } from '../../lib/urlState';
import { sortParked } from '../../lib/sessions';

function PermitCell({ session }: { session: ParkingSession }) {
  const { t } = useTranslation();
  return session.permit ? (
    <span>
      {session.permit.holderName}
      <span className="muted">, {t(`common.permitType.${session.permit.type}`)}</span>
    </span>
  ) : (
    <NoPermitBadge />
  );
}

/** `/admin/activity` – parked now + gate event log (UX §5.10). */
export default function ActivityPage() {
  const { t } = useTranslation();
  const url = useUrlState();
  const tab = url.get('tab') === 'log' ? 'log' : 'parked';
  const plate = url.get('plate');
  const parked = useSessions({ active: true, limit: PAGE_SIZE, plate: plate || undefined });

  const tabTo = (to: 'parked' | 'log') => {
    const p = new URLSearchParams();
    if (to === 'log') p.set('tab', 'log');
    if (plate) p.set('plate', plate);
    const qs = p.toString();
    return qs ? `?${qs}` : '?';
  };

  return (
    <div className="page">
      <PageHeader title={t('activity.title')} />
      <div className="toolbar">
        <Tabs
          label={t('activity.title')}
          items={[
            { key: 'parked', to: tabTo('parked'), label: t('activity.tabs.parked'), active: tab === 'parked', count: parked.data?.total, countTone: 'neutral' },
            { key: 'log', to: tabTo('log'), label: t('activity.tabs.log'), active: tab === 'log' },
          ]}
        />
      </div>
      {tab === 'parked' ? <ParkedTab query={parked} /> : <LogTab />}
    </div>
  );
}

function PlateFilter() {
  const { t } = useTranslation();
  const url = useUrlState();
  return (
    <SearchField
      id="activity-plate"
      label={t('activity.filters.plateLabel')}
      placeholder={t('activity.filters.platePlaceholder')}
      value={url.get('plate')}
      onSearch={(v) => url.update({ plate: v.trim() || null }, { replace: true })}
      className="filter-bar__search"
    />
  );
}

function ParkedTab({ query }: { query: ReturnType<typeof useSessions> }) {
  const { t } = useTranslation();
  const url = useUrlState();
  const isFresh = useFresh();
  const plate = url.get('plate');
  const rows = query.data ? sortParked(query.data.items) : undefined;

  const alarmLink = (s: ParkingSession) =>
    s.openAlarmId ? (
      <Link to={`/admin/alarms?focus=${s.openAlarmId}`} className="link-danger">
        {t('activity.openAlarm')}
      </Link>
    ) : null;

  const columns: Array<Column<ParkingSession>> = [
    { key: 'plate', header: t('common.fields.plate'), cell: (s) => <PlateChip plate={s.plate} size="md" />, cardSlot: 'title' },
    { key: 'permit', header: t('common.fields.permit'), cell: (s) => <PermitCell session={s} /> },
    { key: 'entered', header: t('common.fields.entered'), cell: (s) => <RelativeTime iso={s.enteredAt} />, cardSlot: 'meta' },
    { key: 'duration', header: t('common.fields.duration'), cell: (s) => <Duration since={s.enteredAt} />, align: 'end', cardSlot: 'badge' },
    { key: 'alarm', header: t('common.fields.alarm'), cell: alarmLink, cardSlot: 'action' },
  ];

  return (
    <>
      <div className="filter-bar">
        <PlateFilter />
      </div>
      <Panel flush>
        <ResponsiveTable
          caption={t('activity.tabs.parked')}
          columns={columns}
          rows={rows}
          rowKey={(s) => s.id}
          rowClassName={(s) => cx(isFresh(s.id) && 'is-fresh')}
          loading={query.isPending}
          error={query.isError && !query.data ? <ErrorState onRetry={() => void query.refetch()} retrying={query.isFetching} /> : undefined}
          empty={
            <EmptyState
              icon={Car}
              title={t('activity.empty.parkedTitle')}
              body={t('activity.empty.parkedBody')}
              action={
                plate ? (
                  <Button size="sm" onClick={() => url.update({ plate: null })}>
                    {t('common.actions.clearFilters')}
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Panel>
    </>
  );
}

function LogTab() {
  const { t } = useTranslation();
  const url = useUrlState();
  const isFresh = useFresh();
  const plate = url.get('plate');
  const dirParam = url.get('direction');
  const direction: Direction | undefined = dirParam === 'in' || dirParam === 'out' ? dirParam : undefined;
  const authParam = url.get('authorized');
  const authorized = authParam === 'true' ? true : authParam === 'false' ? false : undefined;
  const filtered = Boolean(plate || direction || authorized !== undefined);

  const query = useGateEvents({ plate: plate || undefined, direction, authorized, limit: PAGE_SIZE, offset: url.offset });

  const plateCell = (e: GateEvent) => {
    const raw = e.plateRaw.trim();
    const formatted = formatPlate(e.plate);
    return <PlateChip plate={e.plate} size="sm" title={raw && raw !== formatted ? t('activity.cameraRead', { raw }) : undefined} />;
  };
  const dirCell = (e: GateEvent) => (
    <span className="dir">
      {e.direction === 'in' ? <LogIn size={16} aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
      {t(`common.direction.${e.direction}`)}
    </span>
  );
  const resultCell = (e: GateEvent) => (e.direction === 'in' && e.authorized !== null ? <AccessBadge authorized={e.authorized} /> : t('common.emptyValue'));
  const permitCell = (e: GateEvent) =>
    e.permit ? (
      <span>
        {e.permit.holderName}
        <span className="muted">, {t(`common.permitType.${e.permit.type}`)}</span>
      </span>
    ) : (
      t('common.emptyValue')
    );
  const alarmCell = (e: GateEvent) =>
    e.alarmId ? (
      <Link to={`/admin/alarms?status=all&focus=${e.alarmId}`} className="link-danger">
        {t('activity.viewAlarm')}
      </Link>
    ) : null;

  const columns: Array<Column<GateEvent>> = [
    { key: 'time', header: t('common.fields.time'), cell: (e) => <RelativeTime iso={e.occurredAt} />, width: '9rem' },
    { key: 'direction', header: t('common.fields.direction'), cell: dirCell },
    { key: 'plate', header: t('common.fields.plate'), cell: plateCell },
    { key: 'result', header: t('common.fields.result'), cell: resultCell },
    { key: 'permit', header: t('common.fields.permit'), cell: permitCell },
    { key: 'gate', header: t('common.fields.gate'), cell: (e) => e.gateId ?? t('common.emptyValue') },
    { key: 'alarm', header: t('common.fields.alarm'), cell: alarmCell },
  ];

  const renderCard = (e: GateEvent) => (
    <>
      <div className="card-row__top">
        <span className="inline-badges">
          {plateCell(e)}
          {dirCell(e)}
        </span>
        {e.direction === 'in' && e.authorized !== null && <AccessBadge authorized={e.authorized} />}
      </div>
      {e.permit && <div className="card-row__body">{permitCell(e)}</div>}
      <div className="card-row__meta">
        <RelativeTime iso={e.occurredAt} />
        {e.gateId && (
          <span>
            {t('common.fields.gate')} {e.gateId}
          </span>
        )}
        {alarmCell(e)}
      </div>
    </>
  );

  const clear = () => url.update({ plate: null, direction: null, authorized: null });

  return (
    <>
      <div className="filter-bar">
        <PlateFilter />
        <SegmentedControl<'all' | Direction>
          name="log-direction"
          legend={t('activity.filters.directionLabel')}
          legendHidden
          value={direction ?? 'all'}
          onChange={(v) => url.update({ direction: v === 'all' ? null : v })}
          options={[
            { value: 'all', label: t('activity.filters.directionAll') },
            { value: 'in', label: t('common.direction.in') },
            { value: 'out', label: t('common.direction.out') },
          ]}
        />
        <div className="filter-bar__item">
          <label htmlFor="log-result" className="sr-only">
            {t('activity.filters.resultLabel')}
          </label>
          <Select id="log-result" compact value={authParam === 'true' || authParam === 'false' ? authParam : ''} onChange={(e) => url.update({ authorized: e.target.value || null })}>
            <option value="">{t('activity.filters.resultAll')}</option>
            <option value="true">{t('common.access.authorized')}</option>
            <option value="false">{t('common.access.unauthorized')}</option>
          </Select>
        </div>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clear}>
            {t('common.actions.clearFilters')}
          </Button>
        )}
      </div>
      <Panel flush>
        <ResponsiveTable
          caption={t('activity.tabs.log')}
          columns={columns}
          rows={query.data?.items}
          rowKey={(e) => e.id}
          rowClassName={(e) => cx(isFresh(e.id) && 'is-fresh')}
          loading={query.isPending}
          error={query.isError && !query.data ? <ErrorState onRetry={() => void query.refetch()} retrying={query.isFetching} /> : undefined}
          renderCard={renderCard}
          empty={
            filtered ? (
              <EmptyState
                icon={ScanLine}
                title={t('activity.empty.filteredTitle')}
                body={t('activity.empty.filteredBody')}
                action={
                  <Button size="sm" onClick={clear}>
                    {t('common.actions.clearFilters')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={ScanLine}
                title={t('activity.empty.logTitle')}
                body={t('activity.empty.logBody')}
                action={
                  <ButtonLink to="/admin/simulator" size="sm">
                    {t('activity.empty.logAction')}
                  </ButtonLink>
                }
              />
            )
          }
        />
      </Panel>
      {query.data && <Pagination total={query.data.total} limit={PAGE_SIZE} offset={url.offset} onOffsetChange={url.setOffset} />}
    </>
  );
}
