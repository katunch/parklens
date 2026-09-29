import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { List } from '../api/types';
import { useDelayedFlag } from '../lib/hooks';
import { ErrorState } from './EmptyState';
import { Skeleton } from './Misc';

interface Props<T> {
  query: UseQueryResult<List<T>>;
  empty: ReactNode;
  children: (items: T[], total: number) => ReactNode;
  skeletonRows?: number;
}

/** Loading (skeletons after 300 ms) / error (retry) / empty / content for one panel (UX §2.6). */
export function QueryBody<T>({ query, empty, children, skeletonRows = 3 }: Props<T>) {
  const showSkeleton = useDelayedFlag(query.isPending);
  if (query.isError && !query.data) return <ErrorState onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  if (!query.data) {
    return (
      <div className="skeleton-list" aria-busy="true">
        {showSkeleton &&
          Array.from({ length: skeletonRows }, (_, i) => (
            <div className="skeleton-list__row" key={i}>
              <Skeleton width={96} height={26} />
              <Skeleton width="45%" />
            </div>
          ))}
      </div>
    );
  }
  if (query.data.items.length === 0) return <>{empty}</>;
  return <>{children(query.data.items, query.data.total)}</>;
}
