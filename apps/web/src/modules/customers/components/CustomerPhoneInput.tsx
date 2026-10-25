import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useCustomerPhoneSuggestions, type CustomerDto } from '../hooks/useCustomers';

interface Props {
  value: string;
  onChange: (phone: string) => void;
  /** Called when an existing customer is picked from the suggestions. */
  onSelect: (customer: CustomerDto) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

const MIN_DIGITS = 3;

/** Phone field that suggests existing customers once 3 digits are typed. */
export function CustomerPhoneInput({ value, onChange, onSelect, className, placeholder, required }: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Debounce so every keystroke doesn't hit the API
  const [term, setTerm] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setTerm(value), 250);
    return () => clearTimeout(t);
  }, [value]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const enough = value.replace(/\D/g, '').length >= MIN_DIGITS;
  const { data: results = [], isFetching } = useCustomerPhoneSuggestions(term);
  const showList = open && enough && (results.length > 0 || isFetching);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (c: CustomerDto) => {
    onSelect(c);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!showList || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[highlight]) choose(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        required={required}
        type="tel"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={className}
        placeholder={placeholder}
      />
      {showList && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">Searching…</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.customer_id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3 py-2 sm:text-sm ${i === highlight ? 'bg-blue-50' : ''}`}
              >
                <p className="font-mono text-gray-900">{c.phone}</p>
                <p className="text-xs text-gray-500">
                  {c.name}
                  {c.company_name && ` · ${c.company_name}`}
                </p>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
