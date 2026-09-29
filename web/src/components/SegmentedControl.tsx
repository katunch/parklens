import { CircleCheck, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  ariaLabel?: string;
  lang?: string;
}

interface Props<T extends string> {
  name: string;
  legend: ReactNode;
  legendHidden?: boolean;
  value: T;
  onChange: (value: T) => void;
  options: Array<SegmentOption<T>>;
  variant?: 'compact' | 'card' | 'dark';
  /** id of the first radio (for focusing the group). */
  id?: string;
  className?: string;
}

/** fieldset + legend with visually hidden native radios (arrow keys for free). */
export function SegmentedControl<T extends string>({
  name,
  legend,
  legendHidden,
  value,
  onChange,
  options,
  variant = 'compact',
  id,
  className,
}: Props<T>) {
  return (
    <fieldset className={cx('seg', `seg--${variant}`, className)}>
      <legend className={legendHidden ? 'sr-only' : 'field__label seg__legend'}>{legend}</legend>
      <div className="seg__options">
        {options.map((o, i) => {
          const checked = o.value === value;
          const Icon = o.icon;
          return (
            <label key={o.value} className={cx('seg__option', checked && 'is-checked')} lang={o.lang}>
              <input
                id={i === 0 ? id : undefined}
                type="radio"
                className="seg__radio"
                name={name}
                value={o.value}
                checked={checked}
                aria-label={o.ariaLabel}
                onChange={() => onChange(o.value)}
              />
              {variant === 'card' ? (
                <>
                  <span className="seg__card-top">
                    {Icon && <Icon size={24} aria-hidden="true" className="seg__card-icon" />}
                    {checked && <CircleCheck size={20} aria-hidden="true" className="seg__card-check" />}
                  </span>
                  <span className="seg__card-title">{o.label}</span>
                  {o.description && <span className="seg__card-desc">{o.description}</span>}
                </>
              ) : (
                <span className="seg__label">
                  {Icon && <Icon size={16} aria-hidden="true" />}
                  {o.label}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
