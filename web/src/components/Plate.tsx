import type { ChangeEvent, KeyboardEvent, ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx';
import { formatPlate, normalizePlate } from '../lib/plate';

const SWISS_RE = /^[A-ZÄÖÜ]{2}\d{1,6}$/;

export type PlateState = 'scanning' | 'allowed' | 'denied' | 'muted';

interface PlateChipProps {
  /** Normalized plate (formatted with formatPlate). */
  plate?: string;
  /** Display string (plateDisplay) – wins over `plate`. */
  display?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Prefix a visually hidden "Plate" where no column header gives context. */
  srPrefix?: boolean;
  title?: string;
  className?: string;
  state?: PlateState;
  /** Renders an interactive `<button>` chip (hover/focus lock-on reticle). */
  onClick?: () => void;
  ariaLabel?: string;
  /** Overlay content (scan beam). */
  children?: ReactNode;
  /** Override the rendered characters (scan decode). */
  text?: string;
  ref?: Ref<HTMLElement>;
}

/**
 * Swiss-style number plate — the signature element (UX §6 PlateChip): shield at md+, lock-on reticle,
 * verdict states. Always light, never truncated, `translate="no"`.
 */
export function PlateChip({ plate, display, size = 'md', srPrefix, title, className, state, onClick, ariaLabel, children, text, ref }: PlateChipProps) {
  const { t } = useTranslation();
  const shown = display && display.trim() ? display : formatPlate(plate ?? '');
  const swiss = SWISS_RE.test(normalizePlate(shown));
  const classes = cx('plate', size !== 'md' && `plate--${size}`, state && `plate--${state}`, onClick && 'plate--interactive', className);
  const inner = (
    <>
      {srPrefix && <span className="sr-only">{t('common.fields.plate')} </span>}
      <span className="plate__txt">{text ?? shown}</span>
      <i className="reticle" aria-hidden="true" />
      {children}
    </>
  );
  if (onClick) {
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        className={classes}
        data-ch={swiss ? '' : undefined}
        translate="no"
        title={title}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <span ref={ref as Ref<HTMLSpanElement>} className={classes} data-ch={swiss ? '' : undefined} translate="no" title={title}>
      {inner}
    </span>
  );
}

interface PlateInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
  size?: 'md' | 'lg';
  invalid?: boolean;
  required?: boolean;
  ref?: Ref<HTMLInputElement>;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/** Text input styled as a plate with shield and focus reticle; uppercases as typed (keeps the caret). */
export function PlateInput({ id, value, onChange, onBlur, onEnter, size = 'lg', invalid, required, ref, ...aria }: PlateInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const upper = el.value.toUpperCase();
    if (upper !== el.value && upper.length === el.value.length) {
      const { selectionStart, selectionEnd } = el;
      el.value = upper;
      if (selectionStart !== null && selectionEnd !== null) el.setSelectionRange(selectionStart, selectionEnd);
    }
    onChange(upper);
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return (
    <div className={cx('plate-input', `plate-input--${size}`, invalid && 'plate-input--error')}>
      <input
        ref={ref}
        id={id}
        className="plate-input__field"
        type="text"
        inputMode="text"
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        placeholder="ZH 123 456"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={20}
        required={required}
        translate="no"
        {...aria}
      />
      <i className="reticle" aria-hidden="true" />
    </div>
  );
}
