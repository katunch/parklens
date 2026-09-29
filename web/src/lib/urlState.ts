import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export const PAGE_SIZE = 50;

/** URL query params as view state (UX §3.1): shareable views, working back button. */
export function useUrlState() {
  const [params, setParams] = useSearchParams();

  const get = useCallback((key: string, fallback = '') => params.get(key) ?? fallback, [params]);

  /** Merge updates into the query string; empty values are removed. Resets `page` unless given. */
  const update = useCallback(
    (updates: Record<string, string | number | boolean | null | undefined>, opts: { replace?: boolean; keepPage?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!opts.keepPage && !('page' in updates)) next.delete('page');
          for (const [k, v] of Object.entries(updates)) {
            if (v === null || v === undefined || v === '' || v === false) next.delete(k);
            else next.set(k, String(v));
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const setOffset = useCallback(
    (off: number) => {
      const p = Math.floor(off / PAGE_SIZE) + 1;
      update({ page: p > 1 ? p : null }, { keepPage: true });
      window.scrollTo({ top: 0 });
    },
    [update],
  );

  return { params, get, update, page, offset, setOffset };
}
