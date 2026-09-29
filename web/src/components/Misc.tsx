import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '../i18n';
import { useNow } from '../lib/hooks';
import { cx } from '../lib/cx';
import { minutesSince } from '../lib/format';
import { useFmt } from '../lib/timezone';
import { SegmentedControl } from './SegmentedControl';

/** Parking-sign "P" mark + wordmark. */
export function Logo({ wordmark = true, className }: { wordmark?: boolean; className?: string }) {
  return (
    <span className={cx('logo', className)}>
      <span className="logo__mark" aria-hidden="true">
        P
      </span>
      {wordmark && <span className="logo__word">ParkLens</span>}
    </span>
  );
}

/** `<time>` with relative wording and the full date-time in the title (UX §2.2). */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const fmt = useFmt();
  const now = useNow();
  return (
    <time dateTime={iso} title={fmt.dateTime(iso)} className={cx('rel-time', className)}>
      {fmt.relative(iso, now)}
    </time>
  );
}

/** Absolute time in a <time> element. */
export function DateTime({ iso, style = 'dateTime' }: { iso: string; style?: 'dateTime' | 'date' | 'time' | 'timeSeconds' | 'dateWeekday' }) {
  const fmt = useFmt();
  return (
    <time dateTime={iso} title={fmt.dateTime(iso)} className="tabular">
      {fmt[style](iso)}
    </time>
  );
}

/** Duration from minutes, or computed live from a start instant. */
export function Duration({ minutes, since }: { minutes?: number; since?: string }) {
  const fmt = useFmt();
  const now = useNow();
  const m = since ? minutesSince(since, now) : (minutes ?? 0);
  return <span className="tabular">{fmt.duration(m)}</span>;
}

export function Skeleton({ width = '100%', height = 16, className }: { width?: number | string; height?: number | string; className?: string }) {
  return <span className={cx('skeleton', className)} style={{ width, height } as CSSProperties} aria-hidden="true" />;
}

export interface DlItem {
  term: ReactNode;
  detail: ReactNode;
}

export function DescriptionList({ items, className }: { items: Array<DlItem | null | false | undefined>; className?: string }) {
  return (
    <dl className={cx('dl', className)}>
      {items.filter((i): i is DlItem => Boolean(i)).map((i, idx) => (
        <div className="dl__row" key={idx}>
          <dt>{i.term}</dt>
          <dd>{i.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** EN | DE switcher; sets i18n, localStorage and <html lang>. */
export function LanguageSwitcher({ dark, className }: { dark?: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  const lang: Language = i18n.resolvedLanguage === 'de' ? 'de' : 'en';
  return (
    <SegmentedControl<Language>
      name={dark ? 'lang-dark' : 'lang'}
      legend={t('common.language.label')}
      legendHidden
      variant={dark ? 'dark' : 'compact'}
      value={lang}
      onChange={setLanguage}
      className={cx('lang-switch', className)}
      options={[
        { value: 'en', label: t('common.language.shortEn'), ariaLabel: t('common.language.en'), lang: 'en' },
        { value: 'de', label: t('common.language.shortDe'), ariaLabel: t('common.language.de'), lang: 'de' },
      ]}
    />
  );
}

/** Admin page header: h1 left, actions right, optional sub-line. */
export function PageHeader({ title, sub, actions, lead }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; lead?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        {sub && <p className="page-header__sub">{sub}</p>}
        {lead && <p className="page-header__lead">{lead}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
