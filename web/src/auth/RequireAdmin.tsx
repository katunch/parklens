import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';

/**
 * Admin routes without a token redirect to /login (UX §3.5):
 * - never logged in: /login?from=<path>
 * - session expired (401): /login?expired=1&from=<path>
 * - logged out: /login with router state { loggedOut: true }
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { token, sessionEnd } = useAuth();
  const location = useLocation();
  if (!token) {
    if (sessionEnd === 'logout') return <Navigate to="/login" replace state={{ loggedOut: true }} />;
    const qs = new URLSearchParams();
    if (sessionEnd === 'expired') qs.set('expired', '1');
    qs.set('from', location.pathname + location.search);
    return <Navigate to={`/login?${qs.toString()}`} replace />;
  }
  return <>{children}</>;
}
