import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router';
import { api, qk } from '../api/endpoints';
import { Ambient } from '../components/Ambient';
import { LanguageSwitcher, Logo } from '../components/Misc';
import { cx } from '../lib/cx';
import { TimezoneProvider } from '../lib/timezone';

/** Public shell: header with logo + language switcher, 560px column, admin-login footer. */
export function PublicLayout({ wide }: { wide?: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const health = useQuery({ queryKey: qk.health, queryFn: api.health, staleTime: Infinity, retry: 1 });
  const onLogin = location.pathname === '/login';
  // The landing page widens to two columns from 1024px (headline + form beside the scanner hero).
  const column = cx('public-column', wide && 'public-column--wide', location.pathname === '/' && 'public-column--hero');
  return (
    <TimezoneProvider timeZone={health.data?.timezone}>
      <Ambient calm />
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
          <div className={cx(column, 'public-enter')} key={location.pathname}>
            <Outlet />
          </div>
        </main>
        {!onLogin && (
          <footer className="public-footer">
            <div className={column}>
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
