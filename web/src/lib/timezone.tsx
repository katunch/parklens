import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_TIMEZONE,
  durationParts,
  formatCalendarDate,
  formatInstant,
  formatMinutesAgo,
  localeFor,
  relativeParts,
  todayInTz,
  ymdInTz,
} from './format';

const TimezoneContext = createContext<string>(DEFAULT_TIMEZONE);

/** Provides the app timezone (from /api/settings for admins, /api/health on public pages). */
export function TimezoneProvider({ timeZone, children }: { timeZone: string | undefined; children: ReactNode }) {
  return <TimezoneContext.Provider value={timeZone || DEFAULT_TIMEZONE}>{children}</TimezoneContext.Provider>;
}

export function useTimezone(): string {
  return useContext(TimezoneContext);
}

/** Formatters bound to the current language and the app timezone (UX §2.2). */
export function useFmt() {
  const { t, i18n } = useTranslation();
  const tz = useTimezone();
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  return useMemo(() => {
    const locale = localeFor(lang);
    const numberFmt = new Intl.NumberFormat(locale);
    const fmt = {
      locale,
      tz,
      dateTime: (iso: string) => formatInstant(iso, 'dateTime', locale, tz),
      date: (iso: string) => formatInstant(iso, 'date', locale, tz),
      dateWeekday: (iso: string) => formatInstant(iso, 'dateWeekday', locale, tz),
      time: (iso: string) => formatInstant(iso, 'time', locale, tz),
      timeSeconds: (iso: string) => formatInstant(iso, 'timeSeconds', locale, tz),
      /** A `YYYY-MM-DD` calendar date. */
      calDate: (ymd: string) => formatCalendarDate(ymd, locale),
      calDateWeekday: (ymd: string) => formatCalendarDate(ymd, locale, true),
      today: () => todayInTz(tz),
      isToday: (iso: string) => ymdInTz(new Date(iso), tz) === todayInTz(tz),
      /** `time` for today, `dateTime` otherwise. */
      timeOrDateTime: (iso: string) =>
        ymdInTz(new Date(iso), tz) === todayInTz(tz)
          ? formatInstant(iso, 'time', locale, tz)
          : formatInstant(iso, 'dateTime', locale, tz),
      number: (n: number) => numberFmt.format(n),
      duration: (minutes: number) => {
        const p = durationParts(minutes);
        return t(`common.duration.${p.key}`, p as unknown as Record<string, unknown>);
      },
      relative: (iso: string, now: Date) => {
        const p = relativeParts(iso, now, locale, tz);
        switch (p.kind) {
          case 'justNow':
            return t('common.time.justNow');
          case 'minutes':
            return formatMinutesAgo(p.minutes, locale);
          case 'today':
            return t('common.time.today', { time: p.time });
          case 'yesterday':
            return t('common.time.yesterday', { time: p.time });
          case 'dateTime':
            return p.dateTime;
        }
      },
    };
    return fmt;
  }, [lang, tz, t]);
}

export type Fmt = ReturnType<typeof useFmt>;
