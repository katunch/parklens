import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDebounced } from '../lib/hooks';
import { TextInput } from './Field';

interface Props {
  id: string;
  label: string;
  labelHidden?: boolean;
  placeholder?: string;
  /** Current value from the URL. */
  value: string;
  /** Called (debounced 300 ms) with the typed text. */
  onSearch: (value: string) => void;
  className?: string;
}

/** Search input with leading icon, debounced 300 ms, synced with its URL param. */
export function SearchField({ id, label, labelHidden = true, placeholder, value, onSearch, className }: Props) {
  const [text, setText] = useState(value);
  const debounced = useDebounced(text, 300);
  const lastSent = useRef(value);

  // External changes (e.g. "Clear filters", back button) update the field.
  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (debounced !== lastSent.current) {
      lastSent.current = debounced;
      onSearch(debounced);
    }
  }, [debounced, onSearch]);

  return (
    <div className={className ? `search-field ${className}` : 'search-field'}>
      <label htmlFor={id} className={labelHidden ? 'sr-only' : 'field__label'}>
        {label}
      </label>
      <TextInput id={id} type="search" icon={Search} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} />
    </div>
  );
}
