import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UseQueryResult } from '@tanstack/react-query';
import type { List, Permit } from '../../api/types';
import { PermitStatusBadge, ValidToday } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { Panel } from '../../components/Panel';
import { PlateChip } from '../../components/Plate';
import { ResponsiveTable, type Column } from '../../components/ResponsiveTable';
import { cx } from '../../lib/cx';
import { useFresh } from '../../lib/fresh';
import { displayPlate } from '../../lib/plate';
import { useFmt } from '../../lib/timezone';
import { PAGE_SIZE } from '../../lib/urlState';

interface Props {
  query: UseQueryResult<List<Permit>>;
  offset: number;
  onOffsetChange: (offset: number) => void;
  onOpen: (permit: Permit) => void;
  empty: ReactNode;
  caption: string;
}

/** Permits table (UX §5.9), also used by the "All requests" tab. */
export function PermitsTable({ query, offset, onOffsetChange, onOpen, empty, caption }: Props) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const isFresh = useFresh();

  const typeText = (p: Permit) =>
    p.type === 'daily' && p.validDate ? t('common.permitDailyOn', { date: fmt.calDate(p.validDate) }) : t('common.permitTypeLong.permanent');

  const statusExtra = (p: Permit) =>
    p.isActiveToday ? <ValidToday /> : p.status === 'approved' && p.isDatePassed ? <span className="text-sm muted">{t('common.datePassed')}</span> : null;

  const source = (p: Permit) =>
    p.source === 'request' ? (
      <div className="stack-xs">
        <span>{t('common.source.request')}</span>
        {p.reference && <code className="mono text-sm">{p.reference}</code>}
      </div>
    ) : (
      t('common.source.admin')
    );

  const detailsButton = (p: Permit) => (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      icon={ChevronRight}
      data-row-action=""
      aria-label={`${t('common.actions.details')}: ${displayPlate(p)}`}
      onClick={() => onOpen(p)}
    />
  );

  const columns: Array<Column<Permit>> = [
    { key: 'plate', header: t('common.fields.plate'), cell: (p) => <PlateChip display={p.plateDisplay} plate={p.plate} size="md" />, cardSlot: 'title' },
    {
      key: 'holder',
      header: t('common.fields.holder'),
      cell: (p) => (
        <div className="stack-xs">
          <span className="strong-500">{p.holderName}</span>
          {p.holderEmail && <span className="text-sm muted break">{p.holderEmail}</span>}
        </div>
      ),
    },
    { key: 'type', header: t('common.fields.type'), cell: typeText },
    {
      key: 'status',
      header: t('common.fields.status'),
      cardSlot: 'badge',
      cell: (p) => (
        <div className="stack-xs">
          <PermitStatusBadge status={p.status} />
          {statusExtra(p)}
        </div>
      ),
    },
    { key: 'source', header: t('common.fields.source'), cell: source, cardSlot: 'meta' },
    { key: 'created', header: t('common.fields.created'), cell: (p) => <time dateTime={p.createdAt} className="tabular">{fmt.date(p.createdAt)}</time>, cardSlot: 'meta' },
    { key: 'details', header: t('common.actions.details'), headerHidden: true, cell: detailsButton, align: 'end', width: '3.5rem', cardSlot: 'hidden' },
  ];

  const renderCard = (p: Permit) => (
    <>
      <div className="card-row__top">
        <PlateChip display={p.plateDisplay} plate={p.plate} size="md" />
        <PermitStatusBadge status={p.status} />
      </div>
      <div className="card-row__body">
        <span className="strong-500">{p.holderName}</span>
        {p.holderEmail && <span className="text-sm muted break"> · {p.holderEmail}</span>}
      </div>
      <div className="card-row__body">
        {typeText(p)} {statusExtra(p)}
      </div>
      <div className="card-row__meta">
        <span>{p.source === 'request' ? `${t('common.source.request')} ${p.reference ?? ''}` : t('common.source.admin')}</span>
        <time dateTime={p.createdAt}>{fmt.date(p.createdAt)}</time>
        <span className="card-row__chevron">{detailsButton(p)}</span>
      </div>
    </>
  );

  return (
    <>
      <Panel flush>
        <ResponsiveTable
          caption={caption}
          columns={columns}
          rows={query.data?.items}
          rowKey={(p) => p.id}
          rowId={(p) => `permit-${p.id}`}
          rowClassName={(p) => cx(isFresh(p.id) && 'is-fresh')}
          clickableRows
          loading={query.isPending}
          error={query.isError && !query.data ? <ErrorState onRetry={() => void query.refetch()} retrying={query.isFetching} /> : undefined}
          empty={empty}
          renderCard={renderCard}
        />
      </Panel>
      {query.data && <Pagination total={query.data.total} limit={PAGE_SIZE} offset={offset} onOffsetChange={onOffsetChange} />}
    </>
  );
}
