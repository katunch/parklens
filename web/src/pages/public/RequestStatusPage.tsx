import { useQuery } from '@tanstack/react-query';
import { Ban, CalendarX, CircleCheck, CircleX, Clock, FileQuestionMark, RefreshCw, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { api, qk } from '../../api/endpoints';
import { toApiError } from '../../api/errors';
import type { PublicRequestStatus } from '../../api/types';
import { Button, ButtonLink } from '../../components/Button';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { DescriptionList, Skeleton } from '../../components/Misc';
import { PlateChip } from '../../components/Plate';
import { useDelayedFlag, useDocumentTitle } from '../../lib/hooks';
import { useFmt, type Fmt } from '../../lib/timezone';
import { tNode } from '../../lib/tnode';

type Tone = 'warning' | 'success' | 'neutral';

interface StatusView {
  tone: Tone;
  icon: LucideIcon;
  titleKey: string;
  bodyKey: string;
  values?: Record<string, string>;
  canRequestAgain: boolean;
}

function statusView(r: PublicRequestStatus, today: string, fmt: Fmt): StatusView {
  switch (r.status) {
    case 'pending':
      return { tone: 'warning', icon: Clock, titleKey: 'status.page.pending.title', bodyKey: 'status.page.pending.body', canRequestAgain: false };
    case 'approved':
      if (r.type === 'daily' && r.validDate) {
        const date = fmt.calDateWeekday(r.validDate);
        return r.validDate < today
          ? { tone: 'neutral', icon: CalendarX, titleKey: 'status.page.expired.title', bodyKey: 'status.page.expired.body', values: { date }, canRequestAgain: true }
          : { tone: 'success', icon: CircleCheck, titleKey: 'status.page.approvedDaily.title', bodyKey: 'status.page.approvedDaily.body', values: { date }, canRequestAgain: false };
      }
      return { tone: 'success', icon: CircleCheck, titleKey: 'status.page.approvedPermanent.title', bodyKey: 'status.page.approvedPermanent.body', canRequestAgain: false };
    case 'rejected':
      return { tone: 'neutral', icon: CircleX, titleKey: 'status.page.rejected.title', bodyKey: 'status.page.rejected.body', canRequestAgain: true };
    case 'revoked':
      return { tone: 'neutral', icon: Ban, titleKey: 'status.page.revoked.title', bodyKey: 'status.page.revoked.body', canRequestAgain: true };
  }
}

/** `/request/:token` – public request status (UX §5.4). */
export function RequestStatusPage() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const fmt = useFmt();

  const query = useQuery({
    queryKey: qk.publicRequest(token),
    queryFn: () => api.getRequest(token),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 60_000 : false),
    refetchOnWindowFocus: (q) => q.state.data?.status === 'pending',
    staleTime: 0,
  });
  const showSkeleton = useDelayedFlag(query.isPending);
  const data = query.data;

  useDocumentTitle(
    t('nav.documentTitle', {
      page: data ? t('status.page.title', { reference: data.reference }) : query.isError ? t('status.notFound.title') : t('status.lookup.title'),
    }),
  );

  if (query.isError && !data) {
    if (toApiError(query.error).code === 'NOT_FOUND') {
      return (
        <EmptyState
          icon={FileQuestionMark}
          level={1}
          title={t('status.notFound.title')}
          body={t('status.notFound.body')}
          action={
            <ButtonLink to="/request/status" variant="secondary">
              {t('status.notFound.action')}
            </ButtonLink>
          }
        />
      );
    }
    return <ErrorState level={2} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }

  if (!data) {
    return (
      <div className="status-page" aria-busy="true">
        {showSkeleton && (
          <>
            <Skeleton width="60%" height={34} />
            <Skeleton width={160} height={40} />
            <Skeleton height={112} />
          </>
        )}
      </div>
    );
  }

  const view = statusView(data, fmt.today(), fmt);
  const Icon = view.icon;

  return (
    <div className="status-page">
      <h1 className="public-title public-title--sm">
        {tNode(t, 'status.page.title', { reference: <code className="mono">{data.reference}</code> })}
      </h1>
      <PlateChip display={data.plateDisplay} plate={data.plate} size="lg" srPrefix />

      <div className={`status-panel status-panel--${view.tone}`} role="status">
        <Icon size={24} aria-hidden="true" className="status-panel__icon" />
        <div>
          <p className="status-panel__title">{t(view.titleKey, view.values)}</p>
          <p className="status-panel__body">{t(view.bodyKey, view.values)}</p>
        </div>
      </div>

      {data.decisionNote && (
        <figure className="decision-note">
          <figcaption className="decision-note__label">{t('status.page.decisionNote')}</figcaption>
          <blockquote className="decision-note__text">«{data.decisionNote}»</blockquote>
        </figure>
      )}

      <section className="status-details" aria-labelledby="status-details-title">
        <h2 id="status-details-title" className="section-title">
          {t('status.page.details')}
        </h2>
        <DescriptionList
          items={[
            { term: t('common.fields.type'), detail: t(`common.permitTypeLong.${data.type}`) },
            data.type === 'daily' && data.validDate ? { term: t('common.fields.date'), detail: fmt.calDateWeekday(data.validDate) } : null,
            { term: t('common.fields.name'), detail: data.holderName },
            { term: t('common.fields.requested'), detail: <time dateTime={data.createdAt}>{fmt.dateTime(data.createdAt)}</time> },
            data.decidedAt ? { term: t('common.fields.decided'), detail: <time dateTime={data.decidedAt}>{fmt.dateTime(data.decidedAt)}</time> } : null,
          ]}
        />
      </section>

      <div className="status-refresh">
        <p className="status-refresh__time">
          {t('status.page.lastChecked', { time: fmt.time(new Date(query.dataUpdatedAt || Date.now()).toISOString()) })}
        </p>
        <Button size="sm" variant="ghost" icon={RefreshCw} loading={query.isFetching} onClick={() => void query.refetch()}>
          {t('common.actions.refresh')}
        </Button>
      </div>
      <p className="field__hint">{t('status.page.bookmarkHint')}</p>

      <div className="status-links">
        <Link to="/request/status">{t('status.page.checkAnother')}</Link>
        {view.canRequestAgain && <Link to={`/request?type=${data.type}`}>{t('status.page.newRequest')}</Link>}
      </div>
    </div>
  );
}
