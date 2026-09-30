import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { toApiError } from './api/errors';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { RequireAdmin } from './auth/RequireAdmin';
import { ToastProvider } from './components/Toast';
import { AdminLayout } from './layouts/AdminLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { NotFoundPage } from './pages/public/NotFoundPage';
import { RequestPage } from './pages/public/RequestPage';
import { RequestStatusPage } from './pages/public/RequestStatusPage';
import { StatusLookupPage } from './pages/public/StatusLookupPage';

const CommandCenterPage = lazy(() => import('./pages/admin/command/CommandCenterPage'));
const AlarmsPage = lazy(() => import('./pages/admin/AlarmsPage'));
const RequestsPage = lazy(() => import('./pages/admin/RequestsPage'));
const PermitsPage = lazy(() => import('./pages/admin/PermitsPage'));
const ActivityPage = lazy(() => import('./pages/admin/ActivityPage'));
const SimulatorPage = lazy(() => import('./pages/admin/SimulatorPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        // Retry network / server errors a couple of times, never client errors.
        retry: (count, error) => {
          const e = toApiError(error);
          if (e.status >= 400 && e.status < 500) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

/** /login while logged in → /admin (UX §3.5). */
function LoginRoute() {
  const { token } = useAuth();
  const location = useLocation();
  if (token) {
    const from = new URLSearchParams(location.search).get('from');
    return <Navigate to={from && from.startsWith('/admin') ? from : '/admin'} replace />;
  }
  return <LoginPage />;
}

/** Pause every infinite animation while the tab is hidden (UX §8: html.is-hidden). */
function useHiddenTabPause() {
  useEffect(() => {
    const sync = () => document.documentElement.classList.toggle('is-hidden', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
}

export function App() {
  const [queryClient] = useState(makeQueryClient);
  useHiddenTabPause();
  return (
    <MotionConfig reducedMotion="user">
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<LandingPage />} />
                <Route path="request" element={<RequestPage />} />
                <Route path="request/status" element={<StatusLookupPage />} />
                <Route path="request/:token" element={<RequestStatusPage />} />
                <Route path="login" element={<LoginRoute />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route
                path="admin"
                element={
                  <RequireAdmin>
                    <AdminLayout />
                  </RequireAdmin>
                }
              >
                <Route
                  element={
                    <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
                      <AdminOutlet />
                    </Suspense>
                  }
                >
                  <Route index element={<CommandCenterPage />} />
                  <Route path="alarms" element={<AlarmsPage />} />
                  <Route path="requests" element={<RequestsPage />} />
                  <Route path="permits" element={<PermitsPage />} />
                  <Route path="activity" element={<ActivityPage />} />
                  <Route path="simulator" element={<SimulatorPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFoundPage admin />} />
                </Route>
              </Route>
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </MotionConfig>
  );
}

function AdminOutlet() {
  return <Outlet />;
}
