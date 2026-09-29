import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFmt } from '../lib/timezone';
import { Button } from './Button';

interface Props {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
}

export function Pagination({ total, limit, offset, onOffsetChange }: Props) {
  const { t } = useTranslation();
  const fmt = useFmt();
  if (total <= limit) return null;
  const from = Math.min(total, offset + 1);
  const to = Math.min(total, offset + limit);
  return (
    <nav className="pagination" aria-label={t('common.pagination.label')}>
      <p className="pagination__range">
        {t('common.pagination.range', { from: fmt.number(from), to: fmt.number(to), total: fmt.number(total) })}
      </p>
      <div className="pagination__buttons">
        <Button
          size="sm"
          iconOnly
          icon={ChevronLeft}
          aria-label={t('common.pagination.previous')}
          disabled={offset <= 0}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        />
        <Button
          size="sm"
          iconOnly
          icon={ChevronRight}
          aria-label={t('common.pagination.next')}
          disabled={offset + limit >= total}
          onClick={() => onOffsetChange(offset + limit)}
        />
      </div>
    </nav>
  );
}
