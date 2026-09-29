import type { CSSProperties } from 'react';

/** 16 or 20px ring; essential progress, so it keeps spinning under reduced motion. */
export function Spinner({ size = 16, className }: { size?: 16 | 20 | number; className?: string }) {
  return (
    <span
      className={className ? `spinner ${className}` : 'spinner'}
      style={{ '--spinner-size': `${size}px` } as CSSProperties}
      aria-hidden="true"
    />
  );
}
