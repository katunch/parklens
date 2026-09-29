import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/endpoints';
import { errorKey, toApiError } from '../../api/errors';
import { usePermits, useSummary } from '../../api/hooks';
import type { Permit } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { CharCounter, Field, Textarea } from '../../components/Field';
import { InlineAlert } from '../../components/InlineAlert';
import { PageHeader, RelativeTime, Skeleton } from '../../components/Misc';
import { PlateChip } from '../../components/Plate';
import { Tabs } from '../../components/Tabs';
import { useToast } from '../../components/Toast';
import { cx } from '../../lib/cx';
import { useFresh } from '../../lib/fresh';
import { useDelayedFlag } from '../../lib/hooks';
import { displayPlate } from '../../lib/plate';
import { useFmt } from '../../lib/timezone';
import { tNode } from '../../lib/tnode';
import { PAGE_SIZE, useUrlState } from '../../lib/urlState';
import { LIMITS, optional, validateNote } from '../../lib/validation';
import { PermitDetailsDialog } from './permitDialogs';
import { PermitsTable } from './PermitsTable';

/** `/admin/requests` – pending queue (cards) and all requests (table) (UX §5.8). */
export default function RequestsPage() {
  const { t } = useTranslation();
  const url = useUrlState();
  const summary = useSummary();
  const tab = url.get('tab') === 'all' ? 'all' : 'pending';
  const pending = summary.data?.pendingRequests;

  return (
    <div className="page">
      <PageHeader title={t('requests.title')} />
      <Tabs
        label={t('requests.title')}
        className="toolbar"
        items={[
          {
            key: 'pending',
            to: '?',
            label: t('requests.tabs.pending'),
            active: tab === 'pending',
            count: pending,
            countTone: 'warning',
            countLabel: pending ? t('nav.pendingRequests', { count: pending }) : undefined,
          },
          { key: 'all', to: '?tab=all', label: t('requests.tabs.all'), active: tab === 'all' },
        ]}
      />
      {tab === 'pending' ? <PendingQueue /> : <AllRequests offset={url.offset} onOffsetChange={url.setOffset} />}
    </div>
  );
}

function AllRequests({ offset, onOffsetChange }: { offset: number; onOffsetChange: (o: number) => void }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Permit | null>(null);
  const query = usePermits({ source: 'request', limit: PAGE_SIZE, offset });
  return (
    <>
      <PermitsTable
        query={query}
        offset={offset}
        onOffsetChange={onOffsetChange}
        onOpen={setSelected}
        caption={t('requests.tabs.all')}
        empty={<EmptyState icon={Inbox} title={t('requests.empty.allTitle')} body={t('requests.empty.allBody')} />}
      />
      <PermitDetailsDialog permit={selected} onClose={() => setSelected(null)} />
    </>
  );
}

interface Warning {
  key: string;
  tone: 'warning' | 'info';
  text: string;
}

function PendingQueue() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const query = usePermits({ status: 'pending', limit: 50 });
  // Duplicate check data: approved permits, fetched once and cached (UX §5.8).
  const approved = usePermits({ status: 'approved', limit: 200 });
  const showSkeleton = useDelayedFlag(query.isPending);
  const [collapsing, setCollapsing] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<{ permit: Permit; note: string } | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const emptyHeading = useRef<HTMLHeadingElement>(null);

  const items = useMemo(() => (query.data?.items ?? []).filter((p) => !removed.has(p.id)), [query.data, removed]);

  // Forget removed ids once the server list no longer contains them.
  useEffect(() => {
    if (!query.data) return;
    const ids = new Set(query.data.items.map((p) => p.id));
    setRemoved((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [query.data]);

  // Move focus after a card is removed: next card's Approve (or Reject), else the empty-state heading.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    if (target === 'empty') {
      if (items.length === 0 && emptyHeading.current) {
        emptyHeading.current.focus();
        pendingFocus.current = null;
      }
      return;
    }
    const approve = document.getElementById(`approve-${target}`) as HTMLButtonElement | null;
    const reject = document.getElementById(`reject-${target}`) as HTMLButtonElement | null;
    const el = approve && !approve.disabled ? approve : reject;
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  });

  const collapse = useCallback(
    (id: string) => {
      const idx = items.findIndex((p) => p.id === id);
      const neighbour = items[idx + 1] ?? items[idx - 1];
      pendingFocus.current = neighbour ? neighbour.id : 'empty';
      setCollapsing((prev) => new Set(prev).add(id));
      const slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 340;
      window.setTimeout(() => {
        setRemoved((prev) => new Set(prev).add(id));
        setCollapsing((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, slow);
    },
    [items],
  );

  const approvedByPlate = useMemo(() => {
    const map = new Map<string, Permit[]>();
    for (const p of approved.data?.items ?? []) map.set(p.plate, [...(map.get(p.plate) ?? []), p]);
    return map;
  }, [approved.data]);

  const warningsFor = (p: Permit): Warning[] => {
    const out: Warning[] = [];
    const plate = displayPlate(p);
    if (p.isDatePassed && p.validDate) {
      out.push({ key: 'datePassed', tone: 'warning', text: t('requests.warnings.datePassed', { date: fmt.calDate(p.validDate) }) });
    }
    const existing = approvedByPlate.get(p.plate) ?? [];
    const permanent = existing.find((e) => e.type === 'permanent');
    if (permanent) out.push({ key: 'hasPermanent', tone: 'info', text: t('requests.warnings.hasPermanent', { plate, name: permanent.holderName }) });
    if (p.type === 'daily' && p.validDate) {
      const daily = existing.find((e) => e.type === 'daily' && e.validDate === p.validDate);
      if (daily) out.push({ key: 'hasDaily', tone: 'info', text: t('requests.warnings.hasDaily', { plate, name: daily.holderName }) });
    }
    if (items.some((o) => o.id !== p.id && o.plate === p.plate)) {
      out.push({ key: 'duplicatePending', tone: 'info', text: t('requests.warnings.duplicatePending') });
    }
    return out;
  };

  if (query.isError && !query.data) return <ErrorState level={2} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  if (!query.data) {
    return (
      <div className="request-queue" aria-busy="true">
        {showSkeleton && [0, 1, 2].map((i) => <Skeleton key={i} height={148} className="skeleton--card" />)}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="panel">
        <EmptyState icon={Inbox} level={2} headingRef={emptyHeading} title={t('requests.empty.pendingTitle')} body={t('requests.empty.pendingBody')} />
      </div>
    );
  }

  return (
    <>
      <ul className="request-queue">
        {items.map((p) => (
          <RequestCard
            key={p.id}
            permit={p}
            warnings={warningsFor(p)}
            collapsing={collapsing.has(p.id)}
            onDone={() => collapse(p.id)}
            onReject={(note) => setRejecting({ permit: p, note })}
            onStale={() => void query.refetch()}
          />
        ))}
      </ul>
      <RejectDialog
        state={rejecting}
        onClose={() => setRejecting(null)}
        onRejected={(id) => {
          setRejecting(null);
          collapse(id);
        }}
        onStale={() => void query.refetch()}
      />
    </>
  );
}

interface RequestCardProps {
  permit: Permit;
  warnings: Warning[];
  collapsing: boolean;
  onDone: () => void;
  onReject: (note: string) => void;
  onStale: () => void;
}

function RequestCard({ permit: p, warnings, collapsing, onDone, onReject, onStale }: RequestCardProps) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const toast = useToast();
  const qc = useQueryClient();
  const isFresh = useFresh();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const noteError = validateNote(note);
  const datePassed = warnings.find((w) => w.key === 'datePassed');
  const plate = displayPlate(p);

  const approve = useMutation({
    mutationFn: () => api.approvePermit(p.id, optional(note)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['permits'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
      toast({ tone: 'success', message: tNode(t, 'requests.approved', { plate: <PlateChip display={p.plateDisplay} size="sm" /> }) });
      onDone();
    },
    onError: (e) => {
      const err = toApiError(e);
      toast({ tone: 'danger', message: t(errorKey(err)) });
      if (err.code === 'DATE_IN_PAST' || err.code === 'INVALID_STATE' || err.code === 'NOT_FOUND') onStale();
    },
  });

  const noteId = `note-${p.id}`;
  const warnId = `warn-${p.id}-datePassed`;

  return (
    <li className={cx('request-card-wrap', collapsing && 'is-collapsing')} aria-hidden={collapsing || undefined}>
      <article className={cx('panel', 'request-card', isFresh(p.id) && 'is-fresh')} aria-label={`${plate}, ${p.holderName}`}>
        <header className="request-card__header">
          <PlateChip display={p.plateDisplay} plate={p.plate} size="md" />
          <div className="request-card__who">
            <p className="request-card__name">{p.holderName}</p>
            {p.holderEmail && <p className="request-card__email">{p.holderEmail}</p>}
          </div>
          <div className="request-card__when">
            <p>{tNode(t, 'requests.requestedAt', { time: <RelativeTime iso={p.createdAt} /> })}</p>
            {p.reference && <p className="mono">{t('requests.reference', { reference: p.reference })}</p>}
          </div>
        </header>
        <p className="request-card__type">
          {p.type === 'daily' && p.validDate ? t('requests.dailyFor', { date: fmt.calDateWeekday(p.validDate) }) : t('requests.permanent')}
        </p>
        {p.requestNote && <blockquote className="request-card__note">{p.requestNote}</blockquote>}
        {warnings.length > 0 && (
          <div className="request-card__warnings">
            {warnings.map((w) => (
              <InlineAlert key={w.key} tone={w.tone} size="sm" id={w.key === 'datePassed' ? warnId : undefined}>
                {w.text}
              </InlineAlert>
            ))}
          </div>
        )}
        <div className="request-card__note-toggle">
          <Button variant="link" size="sm" icon={noteOpen ? Minus : Plus} aria-expanded={noteOpen} aria-controls={noteOpen ? `${noteId}-wrap` : undefined} onClick={() => setNoteOpen((v) => !v)}>
            {t('requests.addNote')}
          </Button>
        </div>
        {noteOpen && (
          <div id={`${noteId}-wrap`}>
            <Field id={noteId} label={t('requests.noteLabel')} hint={t('requests.noteHint')} error={noteError} after={<CharCounter length={note.length} max={LIMITS.noteMax} />}>
              {(aria) => <Textarea {...aria} value={note} onChange={(e) => setNote(e.target.value)} invalid={Boolean(noteError)} autoFocus />}
            </Field>
          </div>
        )}
        <div className="request-card__actions">
          <Button id={`reject-${p.id}`} disabled={approve.isPending} onClick={() => onReject(note)}>
            {t('requests.reject')}
            <span className="sr-only"> {plate}</span>
          </Button>
          <Button
            id={`approve-${p.id}`}
            variant="primary"
            loading={approve.isPending}
            disabled={Boolean(datePassed)}
            aria-describedby={datePassed ? warnId : undefined}
            onClick={() => {
              if (noteError) {
                document.getElementById(noteId)?.focus();
                return;
              }
              approve.mutate();
            }}
          >
            {t('requests.approve')}
            <span className="sr-only"> {plate}</span>
          </Button>
        </div>
      </article>
    </li>
  );
}

function RejectDialog({
  state,
  onClose,
  onRejected,
  onStale,
}: {
  state: { permit: Permit; note: string } | null;
  onClose: () => void;
  onRejected: (id: string) => void;
  onStale: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const noteError = validateNote(note);

  useEffect(() => {
    if (state) setNote(state.note);
  }, [state]);

  const mutation = useMutation({
    mutationFn: (p: Permit) => api.rejectPermit(p.id, optional(note)),
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['permits'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
      toast({ tone: 'success', message: tNode(t, 'requests.rejected', { plate: <PlateChip display={updated.plateDisplay} size="sm" /> }) });
      onRejected(updated.id);
    },
    onError: (e) => {
      const err = toApiError(e);
      toast({ tone: 'danger', message: t(errorKey(err)) });
      onClose();
      onStale();
    },
  });

  const p = state?.permit;
  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      size="sm"
      title={p ? t('requests.rejectDialog.title', { plate: displayPlate(p) }) : ''}
      description={p ? t('requests.rejectDialog.body', { name: p.holderName }) : undefined}
      busy={mutation.isPending}
      dirty={state !== null && note !== state.note}
      initialFocus={noteRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (p && !noteError) mutation.mutate(p);
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={mutation.isPending}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" variant="danger" loading={mutation.isPending}>
            {t('requests.rejectDialog.confirm')}
          </Button>
        </>
      }
    >
      <Field id="reject-note" label={t('requests.rejectDialog.noteLabel')} optional error={noteError} after={<CharCounter length={note.length} max={LIMITS.noteMax} />}>
        {(aria) => (
          <Textarea {...aria} ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('requests.rejectDialog.notePlaceholder')} invalid={Boolean(noteError)} />
        )}
      </Field>
    </Dialog>
  );
}
