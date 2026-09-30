import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { configureClient } from '../api/client';
import { api } from '../api/endpoints';
import type { Admin } from '../api/types';
import { resetDismissed } from '../lib/dismissed';
import { STORAGE_KEYS, storage } from '../lib/storage';

export type SessionEnd = 'expired' | 'logout' | null;

interface AuthState {
  token: string | null;
  admin: Admin | null;
  /** Why the last session ended; RequireAdmin uses it to pick the login redirect. */
  sessionEnd: SessionEnd;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Session ended by the server (401): clear everything and go to /login?expired=1. */
  expire: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Token in localStorage, admin profile, 401 handling (UX §3.5). Mounted inside the router. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => storage.local.get(STORAGE_KEYS.token));
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [sessionEnd, setSessionEnd] = useState<SessionEnd>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    storage.local.remove(STORAGE_KEYS.token);
    storage.session.remove(STORAGE_KEYS.dismissedAlarms);
    // Autopilot and wall mode never outlive the session (UX §11, §12).
    storage.session.remove(STORAGE_KEYS.autopilot);
    resetDismissed();
    setToken(null);
    setAdmin(null);
    // Let the admin tree unmount first, then drop cached admin data.
    window.setTimeout(() => queryClient.clear(), 0);
  }, [queryClient]);

  // On admin routes RequireAdmin performs the redirect (so the two never race); elsewhere we navigate.
  const expire = useCallback(() => {
    if (!tokenRef.current) return;
    setSessionEnd('expired');
    clearSession();
    if (!window.location.pathname.startsWith('/admin')) navigate('/login?expired=1', { replace: true });
  }, [clearSession, navigate]);

  const logout = useCallback(() => {
    // Wall mode survives a token expiry (the kiosk logs back in), not a logout (UX §11).
    storage.session.remove(STORAGE_KEYS.wall);
    setSessionEnd('logout');
    clearSession();
    if (!window.location.pathname.startsWith('/admin')) navigate('/login', { replace: true, state: { loggedOut: true } });
  }, [clearSession, navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setSessionEnd(null);
    storage.local.set(STORAGE_KEYS.token, res.token);
    tokenRef.current = res.token;
    setToken(res.token);
    setAdmin(res.admin);
  }, []);

  // Wire the fetch client before any child effect fires a request.
  useLayoutEffect(() => {
    configureClient({ getToken: () => tokenRef.current, onUnauthorized: expire });
  }, [expire]);

  // Restore the profile after a reload.
  useEffect(() => {
    if (!token || admin) return;
    let cancelled = false;
    api
      .me()
      .then((a) => {
        if (!cancelled) setAdmin(a);
      })
      .catch(() => {
        /* 401 is handled by the client (expire); other errors: keep the session */
      });
    return () => {
      cancelled = true;
    };
  }, [token, admin]);

  // Another tab logged out / in.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.token) return;
      if (!e.newValue && tokenRef.current) {
        setSessionEnd('logout');
        clearSession();
        if (!window.location.pathname.startsWith('/admin')) navigate('/login', { replace: true, state: { loggedOut: true } });
      } else if (e.newValue && e.newValue !== tokenRef.current) {
        tokenRef.current = e.newValue;
        setToken(e.newValue);
        setAdmin(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [clearSession, navigate]);

  const value = useMemo(() => ({ token, admin, sessionEnd, login, logout, expire }), [token, admin, sessionEnd, login, logout, expire]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
