import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}

/** Type-to-search dropdown (prototype SearchableSelect): every typed word must match the label or hint. */
export function SearchableSelect({ options, value, onChange, placeholder = 'Search…', disabled, invalid }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return options;
    return options.filter((o) => {
      const text = `${o.label} ${o.hint ?? ''}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }, [options, query]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted option visible while using the keyboard
  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    setHighlight(0);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const choose = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      {open ? (
        <div className="flex items-center rounded-md border border-blue-500 bg-white px-3 ring-1 ring-blue-500">
          <Icon name="search" className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="w-full border-0 px-2 py-2 outline-none focus:ring-0 sm:text-sm"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={openList}
          disabled={disabled}
          className={`flex w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-left shadow-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm ${invalid ? 'border-amber-400' : 'border-gray-300'}`}
        >
          <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
            {selected ? (
              <>
                <span className="font-medium">{selected.label}</span>
                {selected.hint && <span className="text-gray-500"> · {selected.hint}</span>}
              </>
            ) : (
              placeholder
            )}
          </span>
          <span className="ml-2 flex shrink-0 items-center">
            {selected && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                }}
                className="p-0.5 text-gray-400 hover:text-gray-600"
                title="Clear"
              >
                <Icon name="x" className="h-4 w-4" />
              </span>
            )}
            <Icon name="chevronDown" className="h-4 w-4 text-gray-400" />
          </span>
        </button>
      )}

      {open && (
        <ul ref={listRef} className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No matches for "{query}"</li>
          ) : (
            filtered.map((option, i) => (
              <li
                key={option.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === highlight ? 'bg-blue-50' : ''} ${option.value === value ? 'font-semibold text-blue-700' : 'text-gray-900'}`}
              >
                {option.label}
                {option.hint && <span className="block text-xs font-normal text-gray-500">{option.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
