import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';

interface Props {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  /** What a new entry is called in the "Use … as a new …" row */
  noun?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Free-text input with a suggestion list: every typed word must match (as SearchableSelect).
 * Anything typed is kept, and a name not in the list is offered as a new one.
 */
export function Combobox({ value, onChange, suggestions, noun = 'item', placeholder, className }: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const typed = value.trim();
  const filtered = useMemo(() => {
    const terms = typed.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return suggestions;
    return suggestions.filter((s) => terms.every((t) => s.toLowerCase().includes(t)));
  }, [suggestions, typed]);
  const exact = suggestions.some((s) => s.toLowerCase() === typed.toLowerCase());
  // Last row: keep what was typed as a new name
  const rows = typed && !exact ? [...filtered, null] : filtered;

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted row visible while using the keyboard
  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const choose = (row: string | null) => {
    onChange(row ?? typed);
    setOpen(false);
  };

  // Leaving the field snaps a case-only difference to the stored spelling
  const settle = () => {
    const match = suggestions.find((s) => s.toLowerCase() === typed.toLowerCase());
    if (match && match !== value) onChange(match);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && open && rows.length > 0) {
      e.preventDefault();
      choose(rows[highlight] ?? null);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={settle}
        onKeyDown={onKeyDown}
        className={`${className ?? ''} pr-8`}
      />
      <Icon name="chevronDown" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

      {open && rows.length > 0 && (
        <ul ref={listRef} className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {rows.map((row, i) => (
            <li
              key={row ?? '__new'}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(row);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === highlight ? 'bg-blue-50' : ''} ${
                row === null ? 'border-t border-slate-100 font-semibold text-[#0033A0]' : row === value ? 'font-semibold text-[#0033A0]' : 'text-slate-900'
              }`}
            >
              {row ?? (
                <span className="flex items-center gap-1.5">
                  <Icon name="plus" className="h-3.5 w-3.5" /> Use "{typed}" as a new {noun}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
