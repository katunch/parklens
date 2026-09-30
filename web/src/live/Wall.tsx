import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMediaQuery } from '../lib/hooks';
import { STORAGE_KEYS, storage } from '../lib/storage';

interface WallContextValue {
  wall: boolean;
  /** Wall mode was entered without a user gesture (URL): offer the fullscreen button. */
  needsFullscreen: boolean;
  available: boolean;
  enter: () => void;
  exit: () => void;
  goFullscreen: () => void;
}

const WallContext = createContext<WallContextValue>({
  wall: false,
  needsFullscreen: false,
  available: false,
  enter: () => {},
  exit: () => {},
  goFullscreen: () => {},
});

export function useWall() {
  return useContext(WallContext);
}

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * Wall mode (UX §11): html[data-wall], fullscreen, wake lock, idle cursor, low-effects fallback.
 * Only available ≥ 960px. Persists in sessionStorage so a reload stays in wall mode.
 */
export function WallProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const available = useMediaQuery('(min-width: 960px)');
  const urlWall = new URLSearchParams(location.search).get('wall') === '1';
  const [wall, setWall] = useState(() => urlWall || storage.session.get(STORAGE_KEYS.wall) === '1');
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const wakeLock = useRef<WakeLockSentinelLike | null>(null);
  const enteredFullscreen = useRef(false);

  const active = wall && available;

  const requestFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    el.requestFullscreen?.()
      .then(() => {
        enteredFullscreen.current = true;
        setNeedsFullscreen(false);
      })
      .catch(() => setNeedsFullscreen(true));
  }, []);

  const enter = useCallback(() => {
    setWall(true);
    storage.session.set(STORAGE_KEYS.wall, '1');
    if (location.pathname !== '/admin') navigate('/admin');
    requestFullscreen();
  }, [location.pathname, navigate, requestFullscreen]);

  const exit = useCallback(() => {
    setWall(false);
    setNeedsFullscreen(false);
    storage.session.remove(STORAGE_KEYS.wall);
    enteredFullscreen.current = false;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    if (urlWall) navigate('/admin', { replace: true });
  }, [navigate, urlWall]);

  // URL entry (?wall=1): no user gesture, so show the "Go fullscreen" prompt.
  useEffect(() => {
    if (urlWall && !wall) setWall(true);
    if (urlWall) storage.session.set(STORAGE_KEYS.wall, '1');
  }, [urlWall, wall]);

  useEffect(() => {
    if (active && !document.fullscreenElement && document.fullscreenEnabled) setNeedsFullscreen(true);
  }, [active]);

  // Leaving fullscreen (Esc) also leaves wall mode.
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) {
        enteredFullscreen.current = true;
        setNeedsFullscreen(false);
      } else if (enteredFullscreen.current) {
        enteredFullscreen.current = false;
        setWall(false);
        storage.session.remove(STORAGE_KEYS.wall);
        if (new URLSearchParams(window.location.search).get('wall') === '1') navigate('/admin', { replace: true });
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [navigate]);

  // html[data-wall], wake lock, idle cursor, low-effects measurement.
  useEffect(() => {
    const html = document.documentElement;
    if (!active) {
      html.removeAttribute('data-wall');
      html.removeAttribute('data-lowfx');
      html.classList.remove('is-idle');
      return;
    }
    html.setAttribute('data-wall', '');
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
    nav.wakeLock
      ?.request('screen')
      .then((l) => {
        wakeLock.current = l;
      })
      .catch(() => {});

    let idle: number | undefined;
    const onMove = () => {
      html.classList.remove('is-idle');
      window.clearTimeout(idle);
      idle = window.setTimeout(() => html.classList.add('is-idle'), 3_000);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    onMove();

    // Low-effects fallback: measure the frame rate over 2 s shortly after entering.
    let frames = 0;
    let raf = 0;
    let t0 = 0;
    const measure = (ts: number) => {
      if (!t0) t0 = ts;
      frames++;
      if (ts - t0 < 2_000) raf = requestAnimationFrame(measure);
      else if ((frames * 1000) / (ts - t0) < 45) html.setAttribute('data-lowfx', '');
    };
    const startMeasure = window.setTimeout(() => {
      if (!document.hidden) raf = requestAnimationFrame(measure);
    }, 1_500);

    return () => {
      window.clearTimeout(idle);
      window.clearTimeout(startMeasure);
      cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', onMove);
      void wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
      html.removeAttribute('data-wall');
      html.removeAttribute('data-lowfx');
      html.classList.remove('is-idle');
    };
  }, [active]);

  const value = useMemo(
    () => ({ wall: active, needsFullscreen: active && needsFullscreen, available, enter, exit, goFullscreen: requestFullscreen }),
    [active, needsFullscreen, available, enter, exit, requestFullscreen],
  );
  return <WallContext.Provider value={value}>{children}</WallContext.Provider>;
}
