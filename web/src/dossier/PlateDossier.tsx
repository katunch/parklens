import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Plus, RotateCcwClock, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { api, qk } from '../api/endpoints';
import type { Permit } from '../api/types';
import { AccessBadge, AlarmStatusBadge, AlarmTypeBadge, PermitStatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { ErrorState } from '../components/EmptyState';
import { Skeleton } from '../components/Misc';
import { PlateChip } from '../components/Plate';
import { cx } from '../lib/cx';
import { minutesSince } from '../lib/format';
import { useNow } from '../lib/hooks';
import { formatPlate, normalizePlate } from '../lib/plate';
import { addRecentPlate } from '../lib/recentPlates';
import { useFmt } from '../lib/timezone';
import { useAlarmActions } from '../live/AlarmActions';
import { CreatePermitDialog, PermitDetailsDialog } from '../pages/admin/permitDialogs';

/** Open / close the dossier through the URL (`?dossier=<normalized plate>`, UX §3.1). */
export function useDossier() {
  const [params, setParams] = useSearchParams();
  const open = useCallback(
    (plate: string) => {
      const n = normalizePlate(plate);
      if (!n) return;
      addRecentPlate(n);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('dossier', n);
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );
  const close = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('dossier');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);
  return { plate: params.get('dossier'), open, close };
}

/** Bundle for one plate: permits, recent sessions and alarms, filtered to the exact plate. */
function useDossierData(plate: string | null) {
  return useQuery({
    queryKey: qk.plate(plate ?? ''),
    enabled: Boolean(plate),
    queryFn: async () => {
      const p = plate ?? '';
      const [permits, sessions, alarms] = await Promise.all([
        api.permits({ q: p, limit: 50 }),
        api.sessions({ plate: p, limit: 30 }),
        api.alarms({ status: 'all', plate: p, limit: 30 }),
      ]);
      return {
        permits: permits.items.filter((x) => x.plate === p),
        sessions: sessions.items.filter((x) => x.plate === p).slice(0, 5),
        alarms: alarms.items.filter((x) => x.plate === p).slice(0, 5),
      };
    },
  });
}

/**
 * Plate dossier (UX §10): a right-side drawer with everything about one plate. Opens from lot tiles,
 * palette plates, interactive PlateChips and `?dossier=` on any admin route.
 */
export function PlateDossier() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const now = useNow();
  const navigate = useNavigate();
  const { plate, close } = useDossier();
  const { openResolve } = useAlarmActions();
  const query = useDossierData(plate);
  const ref = useRef<HTMLDialogElement>(null);
  const invoker = useRef<Element | null>(null);
  const [details, setDetails] = useState<Permit | null>(null);
  const [create, setCreate] = useState(false);
  const open = Boolean(plate);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      invoker.current = document.activeElement;
      dlg.showModal();
      dlg.querySelector<HTMLElement>('.drawer__close')?.focus();
    } else if (!open && dlg.open) {
      dlg.close();
      const el = invoker.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    }
  }, [open]);

  const data = query.data;
  const active = data?.sessions.find((s) => !s.exitedAt);
  const openAlarms = data?.alarms.filter((a) => a.status === 'open') ?? [];
  const approvedToday = data?.permits.find((p) => p.status === 'approved' && p.isActiveToday);
  const holder = approvedToday?.holderName ?? data?.permits[0]?.holderName ?? active?.permit?.holderName ?? null;
  const lastSeen = data?.sessions[0] ? (data.sessions[0].exitedAt ?? data.sessions[0].enteredAt) : null;
  const display = plate ? formatPlate(plate) : '';

  const goto = (to: string) => {
    close();
    navigate(to);
  };

  return (
    <>
      <dialog
        ref={ref}
        className="drawer"
        aria-label={t('dossier.label', { plate: display })}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {open && plate && (
          <div className="drawer__panel">
            <header className="drawer__head">
              <PlateChip plate={plate} size="xl" state={openAlarms.length ? 'denied' : undefined} srPrefix />
              <div className="drawer__who">
                <p className="drawer__name">{holder ?? t('palette.plate.unknown')}</p>
                {data && (
                  <p className="drawer__status">
                    {active
                      ? t('dossier.status.parked', { time: fmt.time(active.enteredAt), duration: fmt.duration(minutesSince(active.enteredAt, now)) })
                      : lastSeen
                        ? `${t('dossier.status.notParked')} · ${t('dossier.status.lastSeen', { time: fmt.relative(lastSeen, now) })}`
                        : t('dossier.status.notParked')}
                  </p>
                )}
              </div>
              <button type="button" className="btn btn--ghost btn--sm btn--icon drawer__close" aria-label={t('common.actions.close')} onClick={close}>
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="drawer__body">
              {query.isError && !data ? (
                <ErrorState onRetry={() => void query.refetch()} retrying={query.isFetching} />
              ) : !data ? (
                <div className="stack-md" aria-busy="true">
                  <Skeleton height={20} width="40%" />
                  <Skeleton height={56} />
                  <Skeleton height={56} />
                </div>
              ) : (
                <>
                  <section className="drawer__section" aria-labelledby="dossier-permits">
                    <h2 id="dossier-permits" className="drawer__h">
                      {t('dossier.sections.permits')}
                    </h2>
                    {data.permits.length === 0 ? (
                      <p className="drawer__empty">{t('dossier.empty.permits')}</p>
                    ) : (
                      <ul className="drawer__list">
                        {data.permits.map((p) => (
                          <li key={p.id}>
                            <button type="button" className="drawer__row" onClick={() => setDetails(p)}>
                              <span className="drawer__row-main">
                                <b>{p.holderName}</b>
                                <span>
                                  {p.type === 'daily' && p.validDate ? t('common.permitDailyOn', { date: fmt.calDate(p.validDate) }) : t('common.permitTypeLong.permanent')}
                                  {' · '}
                                  {p.source === 'request' ? `${t('common.source.request')} ${p.reference ?? ''}` : t('common.source.admin')}
                                </span>
                              </span>
                              <PermitStatusBadge status={p.status} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="drawer__section" aria-labelledby="dossier-visits">
                    <h2 id="dossier-visits" className="drawer__h">
                      {t('dossier.sections.visits')}
                    </h2>
                    {data.sessions.length === 0 ? (
                      <p className="drawer__empty">{t('dossier.empty.visits')}</p>
                    ) : (
                      <ul className="drawer__list">
                        {data.sessions.map((s) => (
                          <li key={s.id} className="drawer__row drawer__row--static">
                            <span className="drawer__row-main">
                              <span>
                                {s.exitedAt
                                  ? t('dossier.visit.closed', {
                                      entered: fmt.timeOrDateTime(s.enteredAt),
                                      exited: fmt.timeOrDateTime(s.exitedAt),
                                      duration: fmt.duration(s.durationMinutes),
                                    })
                                  : t('dossier.visit.parked', { entered: fmt.timeOrDateTime(s.enteredAt), duration: fmt.duration(minutesSince(s.enteredAt, now)) })}
                              </span>
                            </span>
                            <AccessBadge authorized={s.authorized} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="drawer__section" aria-labelledby="dossier-alarms">
                    <h2 id="dossier-alarms" className="drawer__h">
                      {t('dossier.sections.alarms')}
                    </h2>
                    {data.alarms.length === 0 ? (
                      <p className="drawer__empty">{t('dossier.empty.alarms')}</p>
                    ) : (
                      <ul className="drawer__list">
                        {data.alarms.map((a) => (
                          <li key={a.id} className={cx('drawer__row', 'drawer__row--static', a.status === 'open' && 'drawer__row--alarm')}>
                            <span className="drawer__row-main">
                              <span className="inline-badges">
                                <AlarmTypeBadge type={a.type} />
                                <AlarmStatusBadge status={a.status} />
                              </span>
                              <span>
                                <time dateTime={a.occurredAt} title={fmt.dateTime(a.occurredAt)}>
                                  {fmt.relative(a.occurredAt, now)}
                                </time>
                                {a.gateId ? ` · ${t('common.fields.gate')} ${a.gateId}` : ''}
                              </span>
                            </span>
                            {a.status === 'open' && (
                              <Button size="sm" variant="primary" onClick={() => openResolve(a)}>
                                {t('alarms.resolve')}
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </div>

            <footer className="drawer__foot">
              {data && !approvedToday && (
                <Button variant="primary" icon={Plus} onClick={() => setCreate(true)}>
                  {t('dossier.actions.createPermit')}
                </Button>
              )}
              <Button icon={RotateCcwClock} onClick={() => goto(`/admin/activity?tab=log&plate=${encodeURIComponent(plate)}`)}>
                {t('dossier.actions.openLog')}
              </Button>
              <Button variant="ghost" icon={BadgeCheck} onClick={() => goto(`/admin/permits?q=${encodeURIComponent(display)}`)}>
                {t('dossier.actions.openPermits')}
              </Button>
            </footer>
          </div>
        )}
      </dialog>
      <PermitDetailsDialog permit={details} onClose={() => setDetails(null)} />
      <CreatePermitDialog open={create} initialPlate={display} onClose={() => setCreate(false)} />
    </>
  );
}
