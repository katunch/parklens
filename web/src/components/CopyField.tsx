import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx';
import { Button } from './Button';

interface CopyFieldProps {
  value: string;
  /** Button label (defaults to "Copy"). */
  copyLabel?: string;
  size?: 'lg' | 'sm';
  /** Middle-truncate long values (links). */
  truncate?: boolean;
  id?: string;
  className?: string;
  /** Shown before the value but not copied (e.g. the HTTP method). */
  prefix?: string;
}

/** Mono value + Copy button; "Copied" for 2 s, announced politely (UX §6 CopyField). */
export function CopyField({ value, copyLabel, size = 'sm', truncate, id, className, prefix }: CopyFieldProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const valueRef = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const selectText = () => {
    const el = valueRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      selectText();
    }
  };

  const tail = truncate ? value.slice(-12) : '';
  const head = truncate ? value.slice(0, Math.max(0, value.length - 12)) : value;

  return (
    <div className={cx('copy-field', `copy-field--${size}`, truncate && 'copy-field--truncate', className)}>
      <code id={id} ref={valueRef} className="copy-field__value" title={truncate ? value : undefined} translate="no">
        {prefix && <span className="copy-field__prefix">{prefix} </span>}
        {truncate ? (
          <>
            <span className="copy-field__head">{head}</span>
            <span className="copy-field__tail">{tail}</span>
          </>
        ) : (
          value
        )}
      </code>
      <Button size="sm" icon={copied ? Check : Copy} onClick={copy} className="copy-field__button">
        {copied ? t('common.actions.copied') : (copyLabel ?? t('common.actions.copy'))}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? t('common.actions.copied') : ''}
      </span>
    </div>
  );
}
