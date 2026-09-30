import { useActiveSessions, useSummary } from '../api/hooks';
import { computeOccupancy, type Occupancy } from '../lib/occupancy';

/**
 * The single source for parked / unauthorized / capacity / free across the command center, the
 * sidebar meter and the timeline's live point: active sessions + summary.capacity.
 */
export function useOccupancy(): { occupancy: Occupancy | undefined; isError: boolean; refetch: () => void } {
  const sessions = useActiveSessions();
  const summary = useSummary();
  const occupancy =
    sessions.data && summary.data
      ? computeOccupancy(sessions.data.total, sessions.data.items, summary.data.capacity, summary.data.parkedUnauthorized)
      : undefined;
  return {
    occupancy,
    isError: (sessions.isError && !sessions.data) || (summary.isError && !summary.data),
    refetch: () => {
      void sessions.refetch();
      void summary.refetch();
    },
  };
}
