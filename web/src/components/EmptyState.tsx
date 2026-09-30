import { TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'success' | 'error';
  level?: 1 | 2 | 3;
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

export function EmptyState({ icon: Icon, title, body, action, tone = 'default', level = 3, headingRef, className }: EmptyStateProps) {
  const H = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
  return (
    <div className={cx('empty', `empty--${tone}`, className)}>
      <span className="empty__ring" aria-hidden="true">
        <Icon size={26} className="empty__icon" />
      </span>
      <H className="empty__title" ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
        {title}
      </H>
      {body && <p className="empty__body">{body}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

/** Load error with "Try again" (UX §2.6). */
export function ErrorState({ onRetry, level = 3, retrying }: { onRetry: () => void; level?: 2 | 3; retrying?: boolean }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={TriangleAlert}
      tone="error"
      level={level}
      title={t('errors.loadFailedTitle')}
      body={t('errors.loadFailedBody')}
      action={
        <Button size="sm" onClick={onRetry} loading={retrying}>
          {t('common.actions.tryAgain')}
        </Button>
      }
    />
  );
}
