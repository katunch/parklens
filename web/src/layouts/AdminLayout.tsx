import { useQuery } from '@tanstack/react-query';
import { DoorOpen, Ellipsis, Siren } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { api, qk } from '../api/endpoints';
import { useSummary } from '../api/hooks';
import type { DashboardSummary } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { AlarmBanner } from '../components/AlarmBanner';
import { CountBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Switch } from '../components/Field';
import { LiveIndicator } from '../components/LiveIndicator';
import { LanguageSwitcher, Logo } from '../components/Misc';
import { cx } from '../lib/cx';
import { TimezoneProvider } from '../lib/timezone';
import { AlarmActionsProvider } from '../live/AlarmActions';
import { LiveProvider, useLive } from '../live/LiveProvider';
import { NAV_ITEMS, currentNavKey, type NavItem } from './nav';

/** Admin shell: timezone from /api/settings, one SSE connection, global resolve dialog. */
export function AdminLayout() {
  const settings = useQuery({ queryKey: qk.settings, queryFn: api.settings, staleTime: 5 * 60_000 });
  return (
    <TimezoneProvider timeZone={settings.data?.timezone}>
      <LiveProvider>
        <AlarmActionsProvider>
          <AdminShell />
        </AlarmActionsProvider>
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

function AdminShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: summary } = useSummary();
  const [moreOpen, setMoreOpen] = useState(false);
  const navKey = currentNavKey(location.pathname);
  const pageLabel = navKey ? t(`nav.${navKey}`) : t('common.appName');

  // Document title: "(1) Alarms – ParkLens" while alarms are open (UX §4.3).
  useEffect(() => {
    const count = summary?.openAlarms ?? 0;
    document.title = count > 0 ? t('nav.documentTitleAlarms', { count, page: pageLabel }) : t('nav.documentTitle', { page: pageLabel });
  }, [summary?.openAlarms, pageLabel, t]);

  // Close the More sheet on navigation.
  useEffect(() => setMoreOpen(false), [location.pathname]);

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#content">
        {t('nav.skipToContent')}
      </a>
      <Sidebar summary={summary} />
      <TopBar summary={summary} pageLabel={pageLabel} />
      <div className="admin-content">
        <AlarmBanner />
        <main id="content" className="admin-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <TabBar summary={summary} navKey={navKey} onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}

function Sidebar({ summary }: { summary: DashboardSummary | undefined }) {
  const { t } = useTranslation();
  const { admin, logout } = useAuth();
  const { status, soundOn, setSoundOn } = useLive();
  const badgeLabel = useBadgeLabel();
  return (
    <aside className="sidebar">
      <Link to="/admin" className="sidebar__logo" aria-label={`${t('common.appName')} – ${t('nav.dashboard')}`}>
        <Logo />
      </Link>
      <nav className="sidebar__nav" aria-label={t('nav.mainLabel')}>
        <ul>
          {NAV_ITEMS.map((item) => {
            const label = badgeLabel(item, summary);
            return (
              <li key={item.key}>
                <NavLink to={item.to} end={item.end} className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
                  <item.icon size={20} aria-hidden="true" className="nav-item__icon" />
                  <span className="nav-item__label">{t(`nav.${item.key}`)}</span>
                  {label && <span className="sr-only">, {label}</span>}
                  <NavBadge item={item} summary={summary} />
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="sidebar__footer">
        <LiveIndicator status={status} />
        <Switch id="sound-sidebar" dark label={t('nav.sound.label')} checked={soundOn} onChange={setSoundOn} />
        <LanguageSwitcher dark />
        <div className="sidebar__user">
          <p className="sidebar__user-name">{admin?.name ?? ' '}</p>
          <p className="sidebar__user-email" title={admin?.email}>
            {admin?.email ?? ' '}
          </p>
        </div>
        <Button variant="nav" size="sm" icon={DoorOpen} onClick={logout}>
          {t('nav.logout')}
        </Button>
      </div>
    </aside>
  );
}

function TopBar({ summary, pageLabel }: { summary: DashboardSummary | undefined; pageLabel: string }) {
  const { t } = useTranslation();
  const { status } = useLive();
  const alarms = summary?.openAlarms ?? 0;
  return (
    <header className="topbar">
      <Link to="/admin" className="topbar__logo" aria-label={`${t('common.appName')} – ${t('nav.dashboard')}`}>
        <Logo wordmark={false} />
      </Link>
      <p className="topbar__title">{pageLabel}</p>
      <LiveIndicator status={status} dotOnly />
      <Link
        to="/admin/alarms"
        className={cx('topbar__alarms', alarms > 0 && 'has-alarms')}
        aria-label={alarms > 0 ? `${t('nav.alarms')}, ${t('nav.openAlarms', { count: alarms })}` : t('nav.alarms')}
      >
        <Siren size={20} aria-hidden="true" />
        <CountBadge count={alarms} tone="danger" />
      </Link>
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
                <span className="tabbar__label">{t(`nav.${item.key}`)}</span>
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
        <Button icon={DoorOpen} onClick={logout} block>
          {t('nav.logout')}
        </Button>
      </div>
    </Dialog>
  );
}
