import { Check, Minus, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WebhookStatus } from '../api/types';
import { Spinner } from './Spinner';

/** Notification column: icon + visually hidden text (UX §5.7). */
export function WebhookStatusIcon({ status, error }: { status: WebhookStatus; error: string | null }) {
  const { t } = useTranslation();
  const text =
    status === 'failed' && error ? t('alarms.webhook.failedWithError', { error }) : t(`alarms.webhook.${status}`);
  return (
    <span className={`webhook-status webhook-status--${status}`} title={text}>
      {status === 'sent' && <Check size={16} aria-hidden="true" />}
      {status === 'failed' && <TriangleAlert size={16} aria-hidden="true" />}
      {status === 'pending' && <Spinner size={16} />}
      {status === 'skipped' && <Minus size={16} aria-hidden="true" />}
      <span className="sr-only">{text}</span>
    </span>
  );
}
