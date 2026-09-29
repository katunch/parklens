import { CircleAlert, ChevronDown, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { useState, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx';
import type { MaybeMsg } from '../lib/validation';

export interface ControlAria {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: MaybeMsg | string;
  optional?: boolean;
  labelHidden?: boolean;
  /** Extra content under the control (e.g. a character counter). */
  after?: ReactNode;
  className?: string;
  children: (aria: ControlAria) => ReactNode;
}

/** Label, control, hint or error (UX §6 Field anatomy); wires aria-describedby / aria-invalid. */
export function Field({ id, label, hint, error, optional, labelHidden, after, className, children }: FieldProps) {
  const { t } = useTranslation();
  const errorText = !error ? null : typeof error === 'string' ? error : t(error.key, error.values);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errorText ? `${id}-error` : undefined;
  const describedBy = errorId ?? hintId;
  return (
    <div className={cx('field', errorText && 'field--invalid', className)}>
      <label htmlFor={id} className={labelHidden ? 'sr-only' : 'field__label'}>
        {label}
        {optional && <span className="field__optional"> ({t('common.optional')})</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': errorText ? true : undefined })}
      {after}
      {errorText ? (
        <p id={errorId} className="field__error">
          <CircleAlert size={14} aria-hidden="true" />
          <span>{errorText}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  invalid?: boolean;
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextInput({ icon: Icon, invalid, mono, className, ref, ...rest }: TextInputProps) {
  const input = (
    <input
      ref={ref}
      className={cx('input', Icon && 'input--with-icon', invalid && 'is-invalid', mono && 'input--mono', className)}
      {...rest}
    />
  );
  if (!Icon) return input;
  return (
    <div className="input-wrap">
      <Icon size={16} className="input-wrap__icon" aria-hidden="true" />
      {input}
    </div>
  );
}

export function PasswordInput({ invalid, className, ref, ...rest }: Omit<TextInputProps, 'type' | 'icon'>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-wrap input-wrap--password">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cx('input', 'input--with-action', invalid && 'is-invalid', className)}
        spellCheck={false}
        autoCapitalize="off"
        {...rest}
      />
      <button
        type="button"
        className="input-wrap__action"
        aria-pressed={visible}
        aria-label={visible ? t('common.actions.hidePassword') : t('common.actions.showPassword')}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  compact?: boolean;
}

export function Select({ invalid, compact, className, children, ...rest }: SelectProps) {
  return (
    <div className={cx('select-wrap', compact && 'select-wrap--compact')}>
      <select className={cx('input', 'select', invalid && 'is-invalid', className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={16} className="select-wrap__icon" aria-hidden="true" />
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ invalid, className, rows = 3, ref, ...rest }: TextareaProps) {
  return <textarea ref={ref} rows={rows} className={cx('input', 'textarea', invalid && 'is-invalid', className)} {...rest} />;
}

/** "420 / 500" counter, shown from `showFrom` characters; danger colour past the maximum. */
export function CharCounter({ length, max, showFrom = Math.round(max * 0.8) }: { length: number; max: number; showFrom?: number }) {
  if (length < showFrom) return null;
  return (
    <p className={cx('char-counter', length > max && 'char-counter--over')} aria-live="polite">
      {length} / {max}
    </p>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
}

export function Checkbox({ id, label, hint, className, ...rest }: CheckboxProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cx('checkbox', className)}>
      <input id={id} type="checkbox" className="checkbox__input" aria-describedby={hintId} {...rest} />
      <div className="checkbox__text">
        <label htmlFor={id} className="checkbox__label">
          {label}
        </label>
        {hint && (
          <p id={hintId} className="checkbox__hint">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

interface SwitchProps {
  id: string;
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  dark?: boolean;
  disabled?: boolean;
  /** Render the switch before the label (forms) instead of after it (sidebar). */
  switchFirst?: boolean;
  className?: string;
}

/** `<button role="switch">` with a clickable label (UX §6 Switch). */
export function Switch({ id, label, checked, onChange, dark, disabled, switchFirst, className }: SwitchProps) {
  return (
    <div className={cx('switch-field', dark && 'switch-field--dark', switchFirst && 'switch-field--switch-first', className)}>
      <label htmlFor={id} className="switch-field__label">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={cx('switch', dark && 'switch--dark')}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" aria-hidden="true" />
      </button>
    </div>
  );
}
