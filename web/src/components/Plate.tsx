import type { ChangeEvent, KeyboardEvent, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx';
import { formatPlate } from '../lib/plate';

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
}

/** Swiss-style number plate: the signature element (UX §6 PlateChip). Never truncated. */
export function PlateChip({ plate, display, size = 'md', srPrefix, title, className }: PlateChipProps) {
  const { t } = useTranslation();
  const text = display && display.trim() ? display : formatPlate(plate ?? '');
  return (
    <span className={cx('plate', `plate--${size}`, className)} translate="no" title={title}>
      {srPrefix && <span className="sr-only">{t('common.fields.plate')} </span>}
      {text}
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

/** Text input styled as a plate; uppercases as typed (keeps the caret), stores the typed form. */
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
    <input
      ref={ref}
      id={id}
      className={cx('plate-input', `plate-input--${size}`, invalid && 'is-invalid')}
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
  );
}
