import { DoorOpen, KeyRound, Maximize, Minimize, Navigation, Search, Siren, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toApiError } from '../api/errors';
import { useGates, useHealth, useSummary } from '../api/hooks';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { LanguageSwitcher } from '../components/Misc';
import { Menu } from '../components/Menu';
import { SegmentedControl } from '../components/SegmentedControl';
import { cx } from '../lib/cx';
import { formatInstant } from '../lib/format';
import { useNow } from '../lib/hooks';
import { useFmt, useTimezone } from '../lib/timezone';
import { useAutopilot } from '../live/Autopilot';
import { useLive, type LiveStatus } from '../live/LiveProvider';
import { useWall } from '../live/Wall';
import { usePalette } from '../palette/CommandPalette';

const TEN_MIN = 10 * 60_000;

/** "Europe/Zurich" → "Zurich". */
export function placeName(tz: string): string {
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
}

export function isApplePlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

export type SystemState = 'ok' | 'degraded' | 'offline';

/** Strip system readout from GET /api/health (UX §3.3). */
export function useSystemState(): SystemState | undefined {
  const health = useHealth();
  if (health.data) return health.data.db === 'ok' ? 'ok' : 'degraded';
  if (health.isError) return toApiError(health.error).status === 503 ? 'degraded' : 'offline';
  return undefined;
}

/** Number of gates with an event in the last 10 minutes. */
export function useActiveGateCount(): number | undefined {
  const gates = useGates();
  const now = useNow();
  if (!gates.data) return undefined;
  return gates.data.items.filter((g) => now.getTime() - Date.parse(g.lastEventAt) < TEN_MIN).length;
}

export function LiveReadout({ status }: { status: LiveStatus }) {
  const { t } = useTranslation();
  const live = status === 'live';
  const label = live ? t('nav.live.connected') : status === 'connecting' ? t('nav.live.connecting') : t('nav.live.reconnecting');
  return (
    <span className={cx('readout', live ? 'readout--live' : 'readout--warn')} title={live ? undefined : t('nav.live.hintDisconnected')} role="status">
      <i className={cx('dot', !live && 'dot--warn dot--static')} aria-hidden="true" />
      <span>{label}</span>
      {!live && <span className="sr-only">. {t('nav.live.hintDisconnected')}</span>}
    </span>
  );
}

function StripClock() {
  const { t } = useTranslation();
  const tz = useTimezone();
  const fmt = useFmt();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id: number;
    const tick = () => {
      const d = new Date();
      setNow(d);
      id = window.setTimeout(tick, 1000 - (d.getTime() % 1000) + 5);
    };
    id = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => window.clearTimeout(id);
  }, []);
  const place = placeName(tz);
  return (
    <div className="clock" aria-label={t('strip.clockLabel', { place })} role="timer">
      <span className="clock__time" aria-hidden="true">
        {formatInstant(now, 'timeSeconds', fmt.locale, tz)}
      </span>
      <span className="clock__tz" aria-hidden="true">
        {place}
      </span>
    </div>
  );
}

export function AutopilotChip({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pilot = useAutopilot();
  if (!pilot.on) return null;
  return (
    <Menu
      label={t('autopilot.title')}
      align="start"
      className="autopilot-wrap"
      trigger={(p) => (
        <button type="button" className="autopilot" title={t('strip.autopilotHint')} aria-label={compact ? t('strip.autopilot') : undefined} {...p}>
          <Navigation size={13} aria-hidden="true" />
          <span className="autopilot__label">{t('strip.autopilot')}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="popover-body">
          <p className="popover-body__title">{t('autopilot.title')}</p>
          <SegmentedControl<'calm' | 'busy'>
            name="autopilot-pace-strip"
            legend={t('autopilot.pace.label')}
            value={pilot.pace}
            onChange={pilot.setPace}
            options={[
              { value: 'calm', label: t('autopilot.pace.calm') },
              { value: 'busy', label: t('autopilot.pace.busy') },
            ]}
          />
          <p className="popover-body__meta">{t('autopilot.stats', { events: pilot.sent, alarms: pilot.alarms })}</p>
          <div className="popover-body__actions">
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                pilot.stop();
                close();
              }}
            >
              {t('autopilot.popover.stop')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                close();
                navigate('/admin/simulator');
              }}
            >
              {t('autopilot.popover.open')}
            </Button>
          </div>
        </div>
      )}
    </Menu>
  );
}

export function AccountMenu() {
  const { t } = useTranslation();
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const name = admin?.name ?? '';
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'A';
  return (
    <Menu
      label={t('strip.account', { name })}
      kind="menu"
      className="account"
      trigger={(p) => (
        <button type="button" className="avatar" aria-label={t('strip.account', { name })} {...p}>
          {initials}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu__head">
            <p className="menu__name">{t('nav.signedInAs', { name })}</p>
            <p className="menu__email">{admin?.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            className="menu__item"
            onClick={() => {
              close();
              navigate('/admin/settings#password');
            }}
          >
            <KeyRound size={16} aria-hidden="true" />
            {t('strip.changePassword')}
          </button>
          <button type="button" role="menuitem" className="menu__item" onClick={logout}>
            <DoorOpen size={16} aria-hidden="true" />
            {t('nav.logout')}
          </button>
        </>
      )}
    </Menu>
  );
}

export function SystemReadout({ state }: { state: SystemState | undefined }) {
  const { t } = useTranslation();
  if (!state) return null;
  return (
    <span className={cx('readout', 'readout--quiet', state !== 'ok' && 'readout--warn')}>
      <i className={cx('dot', 'dot--static', state === 'degraded' && 'dot--warn', state === 'offline' && 'dot--danger')} aria-hidden="true" />
      {t(`strip.system.${state}`)}
    </span>
  );
}

/** The dark command strip (UX §3.3 / §6 CommandStrip); the mobile top bar below 960px. */
export function CommandStrip() {
  const { t } = useTranslation();
  const { status, soundOn, setSoundOn } = useLive();
  const { data: summary } = useSummary();
  const wall = useWall();
  const palette = usePalette();
  const system = useSystemState();
  const gatesActive = useActiveGateCount();
  const alarms = summary?.openAlarms ?? 0;
  const [bumpKey, setBumpKey] = useState(0);
  const [prevAlarms, setPrevAlarms] = useState(alarms);
  if (alarms !== prevAlarms) {
    if (alarms > prevAlarms) setBumpKey((k) => k + 1);
    setPrevAlarms(alarms);
  }
  const apple = isApplePlatform();

  return (
    <header className="strip">
      <Link to="/admin" className="strip__brand" aria-label={`${t('common.appName')} – ${t('nav.dashboard')}`}>
        <span className="logo-mark logo-mark--glow" aria-hidden="true">
          P
        </span>
        <span className="strip__name">ParkLens</span>
      </Link>
      <span className="strip__sep" aria-hidden="true" />
      <div className="strip__group">
        <LiveReadout status={status} />
        {alarms > 0 && (
          <Link
            key={bumpKey}
            to="/admin/alarms?status=open"
            className={cx('strip-alarm', bumpKey > 0 && 'bump')}
            aria-label={`${t('nav.alarms')}, ${t('nav.openAlarms', { count: alarms })}`}
          >
            <Siren size={13} aria-hidden="true" />
            <span className="strip-alarm__text">{t('nav.openAlarms', { count: alarms })}</span>
            <span className="strip-alarm__count" aria-hidden="true">
              {alarms}
            </span>
          </Link>
        )}
        <AutopilotChip />
        <span className="strip__sys">
          <SystemReadout state={system} />
        </span>
        {gatesActive !== undefined && (
          <span className="readout readout--quiet strip__gates">{gatesActive > 0 ? t('strip.gatesActive', { count: gatesActive }) : t('strip.gatesNone')}</span>
        )}
      </div>
      <div className="strip__right">
        <button type="button" className="strip__search" onClick={() => palette.open()} aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K" aria-label={t('strip.search')}>
          <Search size={16} aria-hidden="true" />
          <span className="strip__search-label">{t('strip.search')}</span>
          <kbd aria-hidden="true">{apple ? '⌘' : 'Ctrl'}</kbd>
          <kbd aria-hidden="true">K</kbd>
        </button>
        <StripClock />
        <button
          type="button"
          className="icon-btn strip__sound"
          aria-pressed={soundOn}
          aria-label={t('nav.sound.label')}
          title={soundOn ? t('nav.sound.enabled') : t('nav.sound.disabled')}
          onClick={() => setSoundOn(!soundOn)}
        >
          {soundOn ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
        </button>
        <LanguageSwitcher dark className="strip__lang" />
        {wall.available &&
          (wall.wall ? (
            <Button variant="dark" size="sm" icon={Minimize} className="wall-exit" onClick={wall.exit}>
              {t('strip.wallExit')}
            </Button>
          ) : (
            <button type="button" className="icon-btn strip__wall" aria-label={t('strip.wallEnter')} title={t('strip.wallEnter')} onClick={wall.enter}>
              <Maximize size={16} aria-hidden="true" />
            </button>
          ))}
        <AccountMenu />
      </div>
    </header>
  );
}
