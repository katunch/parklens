import { useCallback, useRef, useState, type FormEvent } from 'react';
import type { MaybeMsg, Msg } from './validation';

export type FormErrors<V> = Partial<Record<keyof V & string, MaybeMsg>>;

interface Options<V> {
  initial: V;
  /** Validate all fields against the current values; return errors in visual field order. */
  validate: (values: V) => FormErrors<V>;
  /** Prefix for field ids (`${idPrefix}-${field}`), used to focus the first invalid field. */
  idPrefix: string;
  /** Fields validated on blur once touched (plate and email, UX §2.5). */
  validateOnBlur?: Array<keyof V & string>;
}

/**
 * Minimal form state for UX §2.5: validate on submit first, then re-validate each field as it
 * changes; focus the first invalid field after a failed submit.
 */
export function useForm<V extends Record<string, unknown>>({ initial, validate, idPrefix, validateOnBlur = [] }: Options<V>) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<FormErrors<V>>({});
  const [submitted, setSubmitted] = useState(false);
  const touched = useRef(new Set<string>());
  const initialRef = useRef(initial);
  const baselineRef = useRef(initial);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const fieldId = useCallback((field: keyof V & string) => `${idPrefix}-${field}`, [idPrefix]);

  const focusField = useCallback(
    (field: string) => {
      window.requestAnimationFrame(() => {
        const el = document.getElementById(`${idPrefix}-${field}`);
        if (el) {
          el.focus();
          if (el instanceof HTMLInputElement && el.type !== 'radio' && el.type !== 'checkbox') el.select?.();
        }
      });
    },
    [idPrefix],
  );

  const set = useCallback(
    <K extends keyof V & string>(field: K, value: V[K], opts: { silent?: boolean } = {}) => {
      const next = { ...valuesRef.current, [field]: value };
      valuesRef.current = next;
      setValues(next);
      if (!opts.silent && (submitted || touched.current.has(field))) {
        const all = validate(next);
        // Re-validate the edited field; also refresh dependent fields that currently show errors.
        setErrors((prev) => {
          const out: FormErrors<V> = { ...prev, [field]: all[field] ?? null };
          for (const k of Object.keys(prev) as Array<keyof V & string>) {
            if (k !== field && prev[k]) out[k] = all[k] ?? null;
          }
          return out;
        });
      } else {
        setErrors((prev) => (prev[field] ? { ...prev, [field]: null } : prev));
      }
    },
    [submitted, validate],
  );

  const blur = useCallback(
    (field: keyof V & string) => {
      if (!validateOnBlur.includes(field)) return;
      const v = valuesRef.current[field];
      if (!submitted && (typeof v !== 'string' || v.trim() === '')) return;
      touched.current.add(field);
      const all = validate(valuesRef.current);
      setErrors((prev) => ({ ...prev, [field]: all[field] ?? null }));
    },
    [submitted, validate, validateOnBlur],
  );

  /** Returns a submit handler: validates everything and calls `onValid` when clean. */
  const handleSubmit = useCallback(
    (onValid: (values: V) => void | Promise<void>) => (e?: FormEvent) => {
      e?.preventDefault();
      setSubmitted(true);
      const all = validate(valuesRef.current);
      setErrors(all);
      const first = (Object.keys(all) as Array<keyof V & string>).find((k) => all[k]);
      if (first) {
        focusField(first);
        return;
      }
      void onValid(valuesRef.current);
    },
    [validate, focusField],
  );

  /** Show a server-side error on a field and focus it. */
  const setFieldError = useCallback(
    (field: keyof V & string, msg: Msg) => {
      setErrors((prev) => ({ ...prev, [field]: msg }));
      focusField(field);
    },
    [focusField],
  );

  /** Reset to `next` (which becomes the new "clean" baseline) or to the initial values. */
  const reset = useCallback((next?: V) => {
    const v = next ?? initialRef.current;
    baselineRef.current = v;
    valuesRef.current = v;
    setValues(v);
    setErrors({});
    setSubmitted(false);
    touched.current.clear();
  }, []);

  const errorCount = Object.values(errors).filter(Boolean).length;
  const dirty = JSON.stringify(values) !== JSON.stringify(baselineRef.current);

  return { values, errors, set, blur, handleSubmit, setFieldError, reset, fieldId, submitted, errorCount, dirty, focusField };
}
