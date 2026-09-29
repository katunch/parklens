import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router';
import { api, qk } from '../api/endpoints';
import { LanguageSwitcher, Logo } from '../components/Misc';
import { TimezoneProvider } from '../lib/timezone';

/** Public shell: header with logo + language switcher, 560px column, admin-login footer. */
export function PublicLayout({ wide }: { wide?: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const health = useQuery({ queryKey: qk.health, queryFn: api.health, staleTime: Infinity, retry: 1 });
  const onLogin = location.pathname === '/login';
  return (
    <TimezoneProvider timeZone={health.data?.timezone}>
      <div className="public-shell">
        <a className="skip-link" href="#content">
          {t('nav.skipToContent')}
        </a>
        <header className="public-header">
          <Link to="/" className="public-header__home" aria-label={t('public.homeLink')}>
            <Logo />
          </Link>
          <LanguageSwitcher />
        </header>
        <main id="content" className="public-main" tabIndex={-1}>
          <div className={wide ? 'public-column public-column--wide' : 'public-column'}>
            <Outlet />
          </div>
        </main>
        {!onLogin && (
          <footer className="public-footer">
            <div className="public-column">
              <Link to="/login" className="public-footer__link">
                {t('public.adminLogin')}
              </Link>
            </div>
          </footer>
        )}
      </div>
    </TimezoneProvider>
  );
}
