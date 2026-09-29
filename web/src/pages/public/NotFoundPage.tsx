import { MapPinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { useDocumentTitle } from '../../lib/hooks';

export function NotFoundPage({ admin }: { admin?: boolean }) {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.documentTitle', { page: t('errors.notFoundPage.title') }));
  return (
    <div className="not-found">
      <EmptyState
        icon={MapPinOff}
        level={1}
        title={t('errors.notFoundPage.title')}
        body={t('errors.notFoundPage.body')}
        action={
          <ButtonLink to={admin ? '/admin' : '/'} variant="secondary">
            {admin ? t('nav.dashboard') : t('errors.notFoundPage.action')}
          </ButtonLink>
        }
      />
    </div>
  );
}
