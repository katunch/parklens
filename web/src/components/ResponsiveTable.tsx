import type { MouseEvent, ReactNode } from 'react';
import { useDelayedFlag, useIsWide } from '../lib/hooks';
import { cx } from '../lib/cx';
import { Skeleton } from './Misc';

export type CardSlot = 'title' | 'badge' | 'body' | 'meta' | 'action' | 'hidden';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  cardSlot?: CardSlot;
  align?: 'start' | 'end';
  width?: string;
  className?: string;
  /** Visually hidden header (e.g. the action column). */
  headerHidden?: boolean;
}

interface Props<T> {
  caption?: string;
  columns: Array<Column<T>>;
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string | false | undefined;
  rowId?: (row: T) => string;
  /** Clickable rows delegate a click to the row's `[data-row-action]` button. */
  clickableRows?: boolean;
  loading?: boolean;
  empty?: ReactNode;
  error?: ReactNode;
  skeletonRows?: number;
  /** Custom card content below 720px (instead of the slot layout). */
  renderCard?: (row: T) => ReactNode;
}

const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"]';

function delegateRowClick(e: MouseEvent<HTMLElement>) {
  const target = e.target as HTMLElement;
  if (target.closest(INTERACTIVE)) return;
  if (window.getSelection()?.toString()) return;
  e.currentTarget.querySelector<HTMLElement>('[data-row-action]')?.click();
}

/** A <table> at ≥ 720px, a card list below (UX §6 ResponsiveTable). */
export function ResponsiveTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  rowClassName,
  rowId,
  clickableRows,
  loading,
  empty,
  error,
  skeletonRows = 5,
  renderCard,
}: Props<T>) {
  const wide = useIsWide();
  const showSkeleton = useDelayedFlag(Boolean(loading && !rows));

  if (error) return <>{error}</>;
  if (!rows) {
    if (!showSkeleton) return <div className="table-placeholder" aria-busy="true" />;
    return (
      <div className="skeleton-list" aria-busy="true">
        {Array.from({ length: skeletonRows }, (_, i) => (
          <div className="skeleton-list__row" key={i}>
            <Skeleton width={96} height={24} />
            <Skeleton width="40%" />
            <Skeleton width="20%" />
          </div>
        ))}
      </div>
    );
  }
  if (rows.length === 0) return <>{empty}</>;

  if (wide) {
    return (
      <div className="table-scroll">
        <table className={cx('table', clickableRows && 'table--clickable')}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined} className={cx(c.align === 'end' && 'is-end', c.className)}>
                  {c.headerHidden ? <span className="sr-only">{c.header}</span> : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                id={rowId?.(r)}
                className={cx(rowClassName?.(r))}
                onClick={clickableRows ? delegateRowClick : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cx(c.align === 'end' && 'is-end', c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const bySlot = (slot: CardSlot) => columns.filter((c) => (c.cardSlot ?? 'body') === slot);
  if (renderCard) {
    return (
      <ul className="card-list" aria-label={caption}>
        {rows.map((r) => (
          <li
            key={rowKey(r)}
            id={rowId?.(r)}
            className={cx('card-row', clickableRows && 'card-row--clickable', rowClassName?.(r))}
            onClick={clickableRows ? delegateRowClick : undefined}
          >
            {renderCard(r)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="card-list" aria-label={caption}>
      {rows.map((r) => {
        const title = bySlot('title');
        const badge = bySlot('badge');
        const body = bySlot('body');
        const meta = bySlot('meta');
        const action = bySlot('action');
        return (
          <li
            key={rowKey(r)}
            id={rowId?.(r)}
            className={cx('card-row', clickableRows && 'card-row--clickable', rowClassName?.(r))}
            onClick={clickableRows ? delegateRowClick : undefined}
          >
            {(title.length > 0 || badge.length > 0) && (
              <div className="card-row__top">
                <div className="card-row__title">
                  {title.map((c) => (
                    <div key={c.key}>{c.cell(r)}</div>
                  ))}
                </div>
                {badge.length > 0 && (
                  <div className="card-row__badge">
                    {badge.map((c) => (
                      <div key={c.key}>{c.cell(r)}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {body.map((c) => (
              <div className="card-row__body" key={c.key}>
                {c.cell(r)}
              </div>
            ))}
            {meta.length > 0 && (
              <div className="card-row__meta">
                {meta.map((c) => (
                  <div key={c.key}>{c.cell(r)}</div>
                ))}
              </div>
            )}
            {action.length > 0 && (
              <div className="card-row__action">
                {action.map((c) => (
                  <div key={c.key}>{c.cell(r)}</div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
