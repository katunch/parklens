import { useQuery } from '@tanstack/react-query';
import { DoorOpen, Ellipsis, Maximize, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { api, qk } from '../api/endpoints';
import { useAlarms, useSummary } from '../api/hooks';
import type { DashboardSummary } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { AlarmBanner } from '../components/AlarmBanner';
import { Ambient } from '../components/Ambient';
import { CountBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Switch } from '../components/Field';
import { LanguageSwitcher } from '../components/Misc';
import { PlateDossier } from '../dossier/PlateDossier';
import { cx } from '../lib/cx';
import { useDismissedAlarms } from '../lib/dismissed';
import { meterWidths } from '../lib/occupancy';
import { TimezoneProvider, useFmt } from '../lib/timezone';
import { AlarmActionsProvider } from '../live/AlarmActions';
import { AutopilotProvider, useAutopilot } from '../live/Autopilot';
import { LiveProvider, useLive } from '../live/LiveProvider';
import { useOccupancy } from '../live/useOccupancy';
import { useWall, WallProvider } from '../live/Wall';
import { CommandPaletteProvider, usePalette } from '../palette/CommandPalette';
import { AccountMenu, AutopilotChip, CommandStrip, LiveReadout, SystemReadout, useSystemState } from './CommandStrip';
import { NAV_ITEMS, currentNavKey, type NavItem } from './nav';

/** Admin shell: timezone, SSE, autopilot, wall mode, resolve dialog, palette, dossier. */
export function AdminLayout() {
  const settings = useQuery({ queryKey: qk.settings, queryFn: api.settings, staleTime: 5 * 60_000 });
  return (
    <TimezoneProvider timeZone={settings.data?.timezone}>
      <LiveProvider>
        <AutopilotProvider>
          <WallProvider>
            <AlarmActionsProvider>
              <CommandPaletteProvider>
                <AdminShell />
              </CommandPaletteProvider>
            </AlarmActionsProvider>
          </WallProvider>
        </AutopilotProvider>
      </LiveProvider>
    </TimezoneProvider>
  );
}

function useBadgeLabel() {
  const { t } = useTranslation();
  return (item: NavItem, summary: DashboardSummary | undefined) => {
    if (item.key === 'alarms' && summary?.openAlarms) return t('nav.openAlarms', { count: summary.openAlarms });
    if (item.key === 'requests' && summary?.pendingRequests) return t('nav.pendingRequests', { count: summary.pendingRequests });
    return null;
  };
}

function NavBadge({ item, summary }: { item: NavItem; summary: DashboardSummary | undefined }) {
  if (item.key === 'alarms') return <CountBadge count={summary?.openAlarms} tone="danger" />;
  if (item.key === 'requests') return <CountBadge count={summary?.pendingRequests} tone="warning" />;
  return null;
}

/** Cursor spotlight on `.spot` instruments (UX §13 #16): one rAF-throttled listener. */
function useSpotlight() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    let ev: PointerEvent | null = null;
    const onMove = (e: PointerEvent) => {
      ev = e;
      if (raf || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const target = (ev?.target as Element | null)?.closest?.('.spot') as HTMLElement | null;
        if (!target || !ev) return;
        const r = target.getBoundingClientRect();
        target.style.setProperty('--mx', `${ev.clientX - r.left}px`);
        target.style.setProperty('--my', `${ev.clientY - r.top}px`);
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
}

function AdminShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: summary } = useSummary();
  const wall = useWall();
  const [moreOpen, setMoreOpen] = useState(false);
  const navKey = currentNavKey(location.pathname);
  const pageLabel = navKey ? t(`nav.${navKey}`) : t('common.appName');
  useSpotlight();

  // Document title: "(1) Alarms – ParkLens" while alarms are open (UX §4.3).
  useEffect(() => {
    const count = summary?.openAlarms ?? 0;
    document.title = count > 0 ? t('nav.documentTitleAlarms', { count, page: pageLabel }) : t('nav.documentTitle', { page: pageLabel });
  }, [summary?.openAlarms, pageLabel, t]);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  return (
    <>
      <Ambient />
      <div className={cx('admin-shell', wall.wall && 'admin-shell--wall')}>
        <a className="skip-link" href="#content">
          {t('nav.skipToContent')}
        </a>
        <CommandStrip />
        <MobileBar />
        <div className="shell">
          <Sidebar summary={summary} />
          <div className="admin-content">
            <AlarmBanner />
            <main id="content" className="admin-main" tabIndex={-1}>
              <Outlet />
            </main>
          </div>
        </div>
        <TabBar summary={summary} navKey={navKey} onMore={() => setMoreOpen(true)} />
        <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
        <Takeover />
        <WallPrompt />
        <PlateDossier />
      </div>
    </>
  );
}

/** Sidebar lot meter (UX §3.3): same occupancy source as the command center. */
function LotMeter() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { occupancy: o } = useOccupancy();
  const w = o ? meterWidths(o) : { authorized: 0, unauthorized: 0 };
  return (
    <Link to="/admin" className="sidebar__meter" aria-label={o ? t('strip.lotLabel', { parked: o.parked, capacity: o.capacity }) : t('strip.lot')}>
      <span className="meter__row">
        <span className="meter__label">{t('strip.lot')}</span>
        <span className="meter__value">{o ? `${fmt.number(o.parked)} / ${fmt.number(o.capacity)}` : ' '}</span>
      </span>
      <span className="meter__bar" aria-hidden="true">
        <i className="a" style={{ width: `${w.authorized}%` }} />
        <i className="u" style={{ width: `${w.unauthorized}%` }} />
      </span>
    </Link>
  );
}

function Sidebar({ summary }: { summary: DashboardSummary | undefined }) {
  const { t } = useTranslation();
  const badgeLabel = useBadgeLabel();
  const pilot = useAutopilot();
  return (
    <aside className="sidebar">
      <nav className="sidebar__nav" aria-label={t('nav.mainLabel')}>
        <ul className="nav">
          {NAV_ITEMS.map((item) => {
            const label = badgeLabel(item, summary);
            return (
              <li key={item.key}>
                <NavLink to={item.to} end={item.end} className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
                  <item.icon size={18} aria-hidden="true" className="nav-item__icon" />
                  <span className="nav-item__label">{t(`nav.${item.key}`)}</span>
                  {label && <span className="sr-only">, {label}</span>}
                  <NavBadge item={item} summary={summary} />
                  {item.key === 'simulator' && pilot.on && <i className="nav__autopilot" title={t('strip.autopilot')} aria-hidden="true" />}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <LotMeter />
    </aside>
  );
}

/** Mobile top bar (< 960px): the strip's compact form. */
function MobileBar() {
  const { t } = useTranslation();
  const { status } = useLive();
  const { data: summary } = useSummary();
  const palette = usePalette();
  const alarms = summary?.openAlarms ?? 0;
  return (
    <header className="topbar">
      <Link to="/admin" className="strip__brand" aria-label={`${t('common.appName')} – ${t('nav.dashboard')}`}>
        <span className="logo-mark logo-mark--glow" aria-hidden="true">
          P
        </span>
        <span className="strip__name topbar__name">ParkLens</span>
      </Link>
      <LiveReadout status={status} />
      {alarms > 0 && (
        <Link to="/admin/alarms?status=open" className="strip-alarm" aria-label={`${t('nav.alarms')}, ${t('nav.openAlarms', { count: alarms })}`}>
          <span className="strip-alarm__text">{t('nav.openAlarms', { count: alarms })}</span>
          <span className="strip-alarm__count" aria-hidden="true">
            {alarms}
          </span>
        </Link>
      )}
      <AutopilotChip compact />
      <span className="topbar__spacer" />
      <button type="button" className="icon-btn" aria-label={t('strip.search')} onClick={() => palette.open()} aria-haspopup="dialog">
        <Search size={18} aria-hidden="true" />
      </button>
      <AccountMenu />
    </header>
  );
}

function TabBar({ summary, navKey, onMore }: { summary: DashboardSummary | undefined; navKey: string | null; onMore: () => void }) {
  const { t } = useTranslation();
  const badgeLabel = useBadgeLabel();
  const items = NAV_ITEMS.filter((i) => ['dashboard', 'alarms', 'requests', 'permits'].includes(i.key));
  const moreActive = navKey === 'activity' || navKey === 'simulator' || navKey === 'settings';
  return (
    <nav className="tabbar" aria-label={t('nav.mainLabel')}>
      <ul>
        {items.map((item) => {
          const label = badgeLabel(item, summary);
          return (
            <li key={item.key}>
              <NavLink to={item.to} end={item.end} className={({ isActive }) => cx('tabbar__item', isActive && 'is-active')}>
                <span className="tabbar__icon">
                  <item.icon size={22} aria-hidden="true" />
                  <NavBadge item={item} summary={summary} />
                </span>
                <span className="tabbar__label">{item.key === 'dashboard' ? t('nav.dashboardShort') : t(`nav.${item.key}`)}</span>
                {label && <span className="sr-only">, {label}</span>}
              </NavLink>
            </li>
          );
        })}
        <li>
          <button type="button" className={cx('tabbar__item', moreActive && 'is-active')} onClick={onMore} aria-haspopup="dialog">
            <span className="tabbar__icon">
              <Ellipsis size={22} aria-hidden="true" />
            </span>
            <span className="tabbar__label">{t('nav.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { admin, logout } = useAuth();
  const { soundOn, setSoundOn } = useLive();
  const system = useSystemState();
  const items = NAV_ITEMS.filter((i) => ['activity', 'simulator', 'settings'].includes(i.key));
  return (
    <Dialog open={open} onClose={onClose} title={t('nav.more')} size="sm" className="dialog--sheet more-sheet">
      <nav aria-label={t('nav.more')}>
        <ul className="more-sheet__links">
          {items.map((item) => (
            <li key={item.key}>
              <NavLink to={item.to} className={({ isActive }) => cx('more-sheet__link', isActive && 'is-active')} onClick={onClose}>
                <item.icon size={20} aria-hidden="true" />
                <span>{t(`nav.${item.key}`)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="more-sheet__settings">
        <Switch id="sound-sheet" label={t('nav.sound.label')} checked={soundOn} onChange={setSoundOn} />
        <LanguageSwitcher />
      </div>
      <div className="more-sheet__user">
        <p className="more-sheet__signed-in">{t('nav.signedInAs', { name: admin?.name ?? '' })}</p>
        <p className="more-sheet__email">{admin?.email}</p>
        <p className="more-sheet__system">
          <SystemReadout state={system} />
        </p>
        <Button icon={DoorOpen} onClick={logout} block>
          {t('nav.logout')}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Alarm takeover edge glow (UX §4.6): two pulses over 2.4 s on `alarm.created`; a breathing
 * residual glow in wall mode while an open alarm is undismissed. Opacity only, pointer-events none.
 */
function Takeover() {
  const { takeover } = useLive();
  const wall = useWall();
  const dismissed = useDismissedAlarms();
  const { data } = useAlarms({ status: 'open', limit: 20 });
  const ref = useRef<HTMLDivElement>(null);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (!takeover.id) return;
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setPulsing(true);
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    const end = () => {
      el.classList.remove('is-on');
      setPulsing(false);
    };
    if (reduced) {
      const id = window.setTimeout(end, 4_000);
      return () => window.clearTimeout(id);
    }
    el.addEventListener('animationend', end, { once: true });
    return () => el.removeEventListener('animationend', end);
  }, [takeover.id]);

  const undismissed = (data?.items ?? []).some((a) => a.status === 'open' && !dismissed.includes(a.id));
  return <div ref={ref} className={cx('takeover', wall.wall && undismissed && !pulsing && 'is-residual')} aria-hidden="true" />;
}

/** Wall mode entered by URL: fullscreen needs a user gesture (UX §11). */
function WallPrompt() {
  const { t } = useTranslation();
  const wall = useWall();
  if (!wall.needsFullscreen) return null;
  return (
    <div className="wall-prompt" role="dialog" aria-label={t('wall.label')}>
      <p>{t('wall.fullscreenPrompt')}</p>
      <Button variant="primary" size="lg" icon={Maximize} onClick={wall.goFullscreen}>
        {t('wall.fullscreenAction')}
      </Button>
    </div>
  );
}
