import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  BadgeCheck,
  Car,
  CornerDownLeft,
  DoorOpen,
  Globe,
  Maximize,
  Minimize,
  Navigation,
  Plus,
  RotateCcwClock,
  ScanLine,
  Search,
  Siren,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../api/endpoints';
import { useActiveSessions, usePermitsToday } from '../api/hooks';
import type { Alarm, ParkingSession, Permit } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Badge } from '../components/Badge';
import { setLanguage } from '../i18n';
import { NAV_ITEMS } from '../layouts/nav';
import { cx } from '../lib/cx';
import { useDebounced, useMediaQuery, useNow } from '../lib/hooks';
import { formatPlate, normalizePlate } from '../lib/plate';
import { addRecentPlate, getRecentPlates } from '../lib/recentPlates';
import { useFmt } from '../lib/timezone';
import { useAutopilot } from '../live/Autopilot';
import { useLive } from '../live/LiveProvider';
import { useWall } from '../live/Wall';
import { useDossier } from '../dossier/PlateDossier';
import { CreatePermitDialog } from '../pages/admin/permitDialogs';
import { minutesSince } from '../lib/format';

interface PaletteContextValue {
  open: (query?: string) => void;
  close: () => void;
  isOpen: boolean;
}

const PaletteContext = createContext<PaletteContextValue>({ open: () => {}, close: () => {}, isOpen: false });

export function usePalette() {
  return useContext(PaletteContext);
}

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

/** Palette state + global hotkeys: ⌘K / Ctrl+K toggles (even while typing), `/` opens (UX §9). */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; query: string; seq: number }>({ open: false, query: '', seq: 0 });
  const [createPlate, setCreatePlate] = useState<string | null>(null);

  const open = useCallback((query = '') => setState((s) => ({ open: true, query, seq: s.seq + 1 })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const otherModal = [...document.querySelectorAll('dialog[open]')].some((d) => !d.classList.contains('palette-dialog'));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (otherModal) return;
        e.preventDefault();
        setState((s) => (s.open ? { ...s, open: false } : { open: true, query: '', seq: s.seq + 1 }));
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(document.activeElement) && !otherModal) {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const value = useMemo(() => ({ open, close, isOpen: state.open }), [open, close, state.open]);
  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPalette key={state.seq} open={state.open} initialQuery={state.query} onClose={close} onCreatePermit={(p) => setCreatePlate(p)} />
      <CreatePermitDialog open={createPlate !== null} initialPlate={createPlate ?? ''} onClose={() => setCreatePlate(null)} />
    </PaletteContext.Provider>
  );
}

// ---------------------------------------------------------------------------

interface PlateResult {
  plate: string;
  holder: string | null;
  permitType: 'permanent' | 'daily' | null;
  pending: boolean;
  parkedSince: string | null;
  openAlarms: number;
}

interface Item {
  id: string;
  kind: 'plate' | 'page' | 'action' | 'search';
  label: string;
  desc?: string;
  icon?: LucideIcon;
  plate?: PlateResult;
  run: () => void;
}

/** Merge the three plate searches by exact normalized plate (UX §9). */
export function mergePlateResults(permits: Permit[], sessions: ParkingSession[], alarms: Alarm[], max = 6): PlateResult[] {
  const map = new Map<string, PlateResult>();
  const get = (plate: string) => {
    let r = map.get(plate);
    if (!r) {
      r = { plate, holder: null, permitType: null, pending: false, parkedSince: null, openAlarms: 0 };
      map.set(plate, r);
    }
    return r;
  };
  for (const p of permits) {
    const r = get(p.plate);
    if (p.status === 'approved' && p.isActiveToday && (!r.permitType || p.type === 'permanent')) {
      r.permitType = p.type;
      r.holder = p.holderName;
    }
    if (p.status === 'pending') r.pending = true;
    r.holder ??= p.holderName;
  }
  for (const s of sessions) {
    if (s.exitedAt) continue;
    const r = get(s.plate);
    r.parkedSince = s.enteredAt;
    if (s.permit) r.holder ??= s.permit.holderName;
  }
  for (const a of alarms) if (a.status === 'open') get(a.plate).openAlarms++;
  return [...map.values()].slice(0, max);
}

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Highlight the matched normalized characters inside the formatted plate. */
function highlightPlate(plate: string, qn: string): ReactNode {
  const f = formatPlate(plate);
  const i = qn ? plate.indexOf(qn) : -1;
  if (i < 0) return f;
  const out: ReactNode[] = [];
  let k = 0;
  let buf = '';
  let inMark = false;
  const flush = (mark: boolean) => {
    if (!buf) return;
    out.push(mark ? <mark key={out.length}>{buf}</mark> : buf);
    buf = '';
  };
  for (const ch of f) {
    if (ch === ' ') {
      buf += ch;
      continue;
    }
    const inside = k >= i && k < i + qn.length;
    if (inside !== inMark) {
      flush(inMark);
      inMark = inside;
    }
    buf += ch;
    k++;
  }
  flush(inMark);
  return out;
}

interface PaletteProps {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onCreatePermit: (plate: string) => void;
}

function CommandPalette({ open, initialQuery, onClose, onCreatePermit }: PaletteProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFmt();
  const now = useNow();
  const { logout } = useAuth();
  const { soundOn, setSoundOn } = useLive();
  const pilot = useAutopilot();
  const wall = useWall();
  const dossier = useDossier();
  const wide = useMediaQuery('(min-width: 960px)');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const invoker = useRef<Element | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const listId = useId();
  const q = query.trim();
  const qn = normalizePlate(q);
  const debouncedQn = useDebounced(qn, 200);
  const permitsToday = usePermitsToday(open);
  const sessions = useActiveSessions();

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      invoker.current = document.activeElement;
      dlg.showModal();
      inputRef.current?.focus();
    } else if (!open && dlg.open) {
      dlg.close();
      const el = invoker.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    }
  }, [open]);

  const plateSearch = useQuery({
    queryKey: ['palette-plates', debouncedQn],
    enabled: open && debouncedQn.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const [p, s, a] = await Promise.all([
        api.permits({ q: debouncedQn, limit: 10 }),
        api.sessions({ active: true, plate: debouncedQn, limit: 10 }),
        api.alarms({ status: 'open', plate: debouncedQn, limit: 10 }),
      ]);
      return mergePlateResults(p.items, s.items, a.items);
    },
  });

  const recents = useMemo<PlateResult[]>(() => {
    const permits = permitsToday.data?.items ?? [];
    const parked = sessions.data?.items ?? [];
    return getRecentPlates().map((plate) => {
      const permit = permits.find((p) => p.plate === plate);
      const session = parked.find((s) => s.plate === plate);
      return {
        plate,
        holder: permit?.holderName ?? session?.permit?.holderName ?? null,
        permitType: permit?.type ?? null,
        pending: false,
        parkedSince: session?.enteredAt ?? null,
        openAlarms: session?.openAlarmId ? 1 : 0,
      };
    });
    // Recompute when the palette opens (the recent-plates store is read, not subscribed).
  }, [open, permitsToday.data, sessions.data]);

  const close = useCallback(() => onClose(), [onClose]);
  const go = useCallback(
    (to: string) => {
      close();
      navigate(to);
    },
    [close, navigate],
  );

  const openPlate = useCallback(
    (plate: string) => {
      addRecentPlate(plate);
      close();
      dossier.open(plate);
    },
    [close, dossier],
  );

  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; items: Item[] }> = [];
    const plateItem = (r: PlateResult): Item => ({ id: `plate-${r.plate}`, kind: 'plate', label: r.holder ?? t('palette.plate.unknown'), plate: r, run: () => openPlate(r.plate) });
    const pages: Item[] = NAV_ITEMS.map((n) => ({
      id: `page-${n.key}`,
      kind: 'page',
      label: t(`nav.${n.key}`),
      desc: t('palette.pageDesc'),
      icon: n.icon,
      run: () => go(n.to),
    }));
    const otherLang = i18n.resolvedLanguage === 'de' ? 'en' : 'de';
    const plateQuery = qn.length >= 2 ? formatPlate(qn) : '';
    const actions: Item[] = [
      { id: 'a-new', kind: 'action', label: t('palette.actions.newPermit'), desc: t('palette.actions.newPermitDesc'), icon: Plus, run: () => (close(), onCreatePermit(plateQuery)) },
      {
        id: 'a-sim',
        kind: 'action',
        label: plateQuery ? t('palette.actions.simulateCheckInPlate', { plate: plateQuery }) : t('palette.actions.simulateCheckIn'),
        desc: t('palette.actions.simulateDesc'),
        icon: ScanLine,
        run: () => go(plateQuery ? `/admin/simulator?plate=${encodeURIComponent(plateQuery)}` : '/admin/simulator'),
      },
      {
        id: 'a-pilot',
        kind: 'action',
        label: pilot.on ? t('palette.actions.autopilotStop') : t('palette.actions.autopilotStart'),
        desc: t('palette.actions.autopilotDesc'),
        icon: Navigation,
        run: () => (close(), pilot.toggle()),
      },
      ...(wide
        ? [
            {
              id: 'a-wall',
              kind: 'action' as const,
              label: wall.wall ? t('palette.actions.wallExit') : t('palette.actions.wallEnter'),
              desc: t('palette.actions.wallDesc'),
              icon: wall.wall ? Minimize : Maximize,
              run: () => (close(), wall.wall ? wall.exit() : wall.enter()),
            },
          ]
        : []),
      {
        id: 'a-lang',
        kind: 'action',
        label: t('palette.actions.language', { language: t(`common.language.${otherLang}`) }),
        desc: t('palette.actions.languageDesc'),
        icon: Globe,
        run: () => (close(), setLanguage(otherLang)),
      },
      {
        id: 'a-sound',
        kind: 'action',
        label: soundOn ? t('palette.actions.soundOff') : t('palette.actions.soundOn'),
        desc: t('palette.actions.soundDesc'),
        icon: soundOn ? VolumeX : Volume2,
        run: () => (close(), setSoundOn(!soundOn)),
      },
      { id: 'a-logout', kind: 'action', label: t('palette.actions.logout'), desc: t('palette.actions.logoutDesc'), icon: DoorOpen, run: () => (close(), logout()) },
    ];
    if (!q) {
      if (recents.length) out.push({ key: 'recent', label: t('palette.groups.recent'), items: recents.map(plateItem) });
      out.push({ key: 'pages', label: t('palette.groups.pages'), items: pages });
      out.push({ key: 'actions', label: t('palette.groups.actions'), items: actions });
      return out;
    }
    const ql = q.toLowerCase();
    const match = (i: Item) => i.label.toLowerCase().includes(ql) || (i.desc ?? '').toLowerCase().includes(ql);
    if (qn.length >= 2 && plateSearch.data?.length) out.push({ key: 'plates', label: t('palette.groups.plates'), items: plateSearch.data.map(plateItem) });
    const pg = pages.filter(match);
    if (pg.length) out.push({ key: 'pages', label: t('palette.groups.pages'), items: pg });
    const ac = actions.filter(match);
    if (ac.length) out.push({ key: 'actions', label: t('palette.groups.actions'), items: ac });
    out.push({
      key: 'search',
      label: t('palette.groups.search'),
      items: [
        { id: 's-permits', kind: 'search', label: t('palette.searchPermits', { query: q }), desc: t('palette.searchPermitsDesc'), icon: BadgeCheck, run: () => go(`/admin/permits?q=${encodeURIComponent(q)}`) },
        {
          id: 's-log',
          kind: 'search',
          label: t('palette.searchLog', { query: q }),
          desc: t('palette.searchLogDesc'),
          icon: RotateCcwClock,
          run: () => go(`/admin/activity?tab=log&plate=${encodeURIComponent(q)}`),
        },
      ],
    });
    return out;
  }, [q, qn, plateSearch.data, recents, t, i18n.resolvedLanguage, pilot, wall, wide, soundOn, setSoundOn, logout, go, close, openPlate, onCreatePermit]);

  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const safeActive = items.length ? Math.min(active, items.length - 1) : 0;
  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${safeActive}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [safeActive]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[safeActive]?.run();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  const searching = qn.length >= 2 && (plateSearch.isFetching || debouncedQn !== qn) && !plateSearch.data;
  const noMatches = q && groups.every((g) => g.key === 'search') && !searching;
  let index = -1;

  return (
    <dialog
      ref={dialogRef}
      className="palette-dialog"
      aria-label={t('palette.label')}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {open && (
        <div className="palette">
          <div className="palette__bar">
            <Search size={20} aria-hidden="true" className="palette__search-icon" />
            <input
              ref={inputRef}
              className="palette__input"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items.length ? `${listId}-opt-${safeActive}` : undefined}
              placeholder={t('palette.placeholder')}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <kbd>Esc</kbd>
          </div>
          <div className="palette__list" id={listId} role="listbox" aria-label={t('palette.label')} ref={listRef}>
            {noMatches && (
              <div className="palette__empty">
                <p className="palette__empty-title">{t('palette.noResults', { query: q })}</p>
                <p>{t('palette.noResultsHint')}</p>
              </div>
            )}
            {searching && (
              <div className="palette__searching" aria-busy="true">
                <span className="skeleton" style={{ width: 88, height: 22 }} />
                <span>{t('palette.searching')}</span>
              </div>
            )}
            {plateSearch.isError && qn.length >= 2 && <div className="palette__searching">{t('errors.NETWORK')}</div>}
            {groups.map((g) => (
              <div role="group" aria-labelledby={`${listId}-g-${g.key}`} key={g.key}>
                <div className="palette__group" id={`${listId}-g-${g.key}`}>
                  {g.label}
                </div>
                {g.items.map((it) => {
                  index++;
                  const i = index;
                  const selected = i === safeActive;
                  return (
                    <div
                      key={it.id}
                      id={`${listId}-opt-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={selected}
                      className="palette__item"
                      onPointerMove={() => i !== safeActive && setActive(i)}
                      onClick={() => it.run()}
                    >
                      {it.plate ? (
                        <>
                          <span className={cx('plate', 'plate--sm', selected && 'plate--hover')} translate="no">
                            <span className="plate__txt">{highlightPlate(it.plate.plate, qn)}</span>
                          </span>
                          <span className="palette__text">
                            <span className="palette__label">{it.label}</span>
                            <span className="palette__desc">
                              {it.plate.parkedSince && (
                                <Badge tone="live" icon={Car}>
                                  {t('palette.plate.parked', { duration: fmt.duration(minutesSince(it.plate.parkedSince, now)) })}
                                </Badge>
                              )}
                              {it.plate.permitType ? (
                                <Badge tone="success">{t(`palette.plate.${it.plate.permitType}`)}</Badge>
                              ) : (
                                <Badge tone="danger">{t('palette.plate.noPermit')}</Badge>
                              )}
                              {it.plate.pending && <Badge tone="warning">{t('palette.plate.pending')}</Badge>}
                              {it.plate.openAlarms > 0 && (
                                <Badge tone="danger" icon={Siren}>
                                  {t('palette.plate.openAlarms', { count: it.plate.openAlarms })}
                                </Badge>
                              )}
                            </span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="palette__ico" aria-hidden="true">
                            {it.icon ? <it.icon size={16} /> : <ArrowRightLeft size={16} />}
                          </span>
                          <span className="palette__text">
                            <span className="palette__label">{highlight(it.label, q)}</span>
                            {it.desc && <span className="palette__desc">{it.desc}</span>}
                          </span>
                        </>
                      )}
                      <span className="palette__right">
                        {selected ? (
                          <kbd aria-hidden="true">
                            <CornerDownLeft size={12} />
                          </kbd>
                        ) : it.kind === 'page' ? (
                          t('palette.pageTag')
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="palette__foot">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd>
              {t('palette.hints.move')}
            </span>
            <span>
              <kbd>
                <CornerDownLeft size={12} aria-hidden="true" />
              </kbd>
              {t('palette.hints.open')}
            </span>
            <span>
              <kbd>Esc</kbd>
              {t('palette.hints.close')}
            </span>
            <span className="palette__count" aria-live="polite">
              {t('palette.results', { count: items.length })}
            </span>
          </div>
        </div>
      )}
    </dialog>
  );
}
