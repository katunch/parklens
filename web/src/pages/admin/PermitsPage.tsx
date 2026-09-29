import { BadgeCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermits } from '../../api/hooks';
import type { Permit, PermitStatus, PermitType } from '../../api/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Checkbox, Select } from '../../components/Field';
import { PageHeader } from '../../components/Misc';
import { SearchField } from '../../components/SearchField';
import { SegmentedControl } from '../../components/SegmentedControl';
import { PAGE_SIZE, useUrlState } from '../../lib/urlState';
import { CreatePermitDialog, PermitDetailsDialog } from './permitDialogs';
import { PermitsTable } from './PermitsTable';

const STATUSES: PermitStatus[] = ['pending', 'approved', 'rejected', 'revoked'];

/** `/admin/permits` – all permits: filter, create, details, revoke (UX §5.9). */
export default function PermitsPage() {
  const { t } = useTranslation();
  const url = useUrlState();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Permit | null>(null);

  const q = url.get('q');
  const statusParam = url.get('status');
  const status = (STATUSES as string[]).includes(statusParam) ? (statusParam as PermitStatus) : undefined;
  const typeParam = url.get('type');
  const type = typeParam === 'permanent' || typeParam === 'daily' ? (typeParam as PermitType) : undefined;
  const activeToday = url.get('activeToday') === 'true';
  const filtered = Boolean(q || status || type || activeToday);

  const query = usePermits({ q: q || undefined, status, type, activeToday: activeToday || undefined, limit: PAGE_SIZE, offset: url.offset });

  const empty = filtered ? (
    <EmptyState
      icon={BadgeCheck}
      title={t('permits.empty.filteredTitle')}
      body={t('permits.empty.filteredBody')}
      action={
        <Button size="sm" onClick={() => url.update({ q: null, status: null, type: null, activeToday: null })}>
          {t('common.actions.clearFilters')}
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={BadgeCheck}
      title={t('permits.empty.title')}
      body={t('permits.empty.body')}
      action={
        <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
          {t('permits.create')}
        </Button>
      }
    />
  );

  return (
    <div className="page">
      <PageHeader
        title={t('permits.title')}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
            {t('permits.create')}
          </Button>
        }
      />
      <div className="filter-bar" role="search" aria-label={t('permits.filters.searchLabel')}>
        <SearchField
          id="permits-q"
          label={t('permits.filters.searchLabel')}
          placeholder={t('permits.filters.searchPlaceholder')}
          value={q}
          onSearch={(v) => url.update({ q: v.trim() || null }, { replace: true })}
          className="filter-bar__search"
        />
        <div className="filter-bar__item">
          <label htmlFor="permits-status" className="sr-only">
            {t('permits.filters.statusLabel')}
          </label>
          <Select id="permits-status" compact value={status ?? ''} onChange={(e) => url.update({ status: e.target.value || null })}>
            <option value="">{t('permits.filters.statusAll')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`common.permitStatus.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <SegmentedControl<'all' | PermitType>
          name="permits-type"
          legend={t('permits.filters.typeLabel')}
          legendHidden
          value={type ?? 'all'}
          onChange={(v) => url.update({ type: v === 'all' ? null : v })}
          options={[
            { value: 'all', label: t('permits.filters.typeAll') },
            { value: 'permanent', label: t('common.permitType.permanent') },
            { value: 'daily', label: t('common.permitType.daily') },
          ]}
        />
        <Checkbox
          id="permits-active-today"
          label={t('permits.filters.activeToday')}
          checked={activeToday}
          onChange={(e) => url.update({ activeToday: e.target.checked ? 'true' : null })}
          className="filter-bar__checkbox"
        />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => url.update({ q: null, status: null, type: null, activeToday: null })}>
            {t('common.actions.clearFilters')}
          </Button>
        )}
      </div>
      <PermitsTable query={query} offset={url.offset} onOffsetChange={url.setOffset} onOpen={setSelected} empty={empty} caption={t('permits.title')} />
      <CreatePermitDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <PermitDetailsDialog permit={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
