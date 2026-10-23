import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useActiveWorkers } from '@/modules/orders/hooks/useOrders';

/**
 * Searchable multi-select of the branch's active employees (BR03/BR19/BR20).
 * Sits where the prototype had the free-text "Worker Name" field.
 */
export function WorkerMultiSelect({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: workers = [], isLoading } = useActiveWorkers();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = workers.filter((w) => value.includes(w.employee_id));
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workers.filter(
      (w) => !value.includes(w.employee_id) && (!q || w.full_name.toLowerCase().includes(q) || w.employee_code.toLowerCase().includes(q)),
    );
  }, [workers, value, query]);

  const add = (id: string) => {
    onChange([...value, id]);
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div
        className="flex min-h-[38px] w-full flex-wrap items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((w) => (
          <span key={w.employee_id} className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
            {w.full_name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((id) => id !== w.employee_id));
              }}
              className="text-blue-500 hover:text-blue-800"
              aria-label={`Remove ${w.full_name}`}
            >
              <Icon name="x" className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && options[0]) {
              e.preventDefault();
              add(options[0].employee_id);
            }
            if (e.key === 'Backspace' && !query && value.length) onChange(value.slice(0, -1));
          }}
          placeholder={selected.length ? '' : isLoading ? 'Loading…' : 'Select worker(s)'}
          className="min-w-[80px] flex-1 border-0 py-1 text-sm outline-none"
        />
      </div>
      {open && options.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {options.map((w) => (
            <li key={w.employee_id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(w.employee_id)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-blue-50"
              >
                <span className="font-medium text-gray-900">{w.full_name}</span>
                <span className="font-mono text-xs text-gray-400">
                  {w.employee_code}
                  {w.designation ? ` · ${w.designation}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
