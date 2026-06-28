import { useState } from 'react';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { EmptyState } from '@/shared/components/EmptyState';
import { useCustomerSearch, type CustomerDto } from '../hooks/useCustomers';

interface Props {
  onSelect?: (customer: CustomerDto) => void;
}

export function CustomerSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const { data: results = [], isFetching } = useCustomerSearch(query);

  return (
    <div className="space-y-3">
      <input
        className="input w-full"
        placeholder="Search by phone number…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {query.length >= 3 && (
        isFetching ? (
          <p className="text-sm text-gray-400">Searching…</p>
        ) : results.length === 0 ? (
          <EmptyState message="No customers found" />
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {results.map((c) => (
              <li
                key={c.customer_id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{c.full_name}</p>
                  <p className="text-xs text-gray-500">{c.phone}</p>
                  {c.company_name && (
                    <p className="text-xs text-gray-400">{c.company_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={c.customer_type.toLowerCase()} />
                  {onSelect && (
                    <button
                      className="btn-primary text-xs"
                      onClick={() => onSelect(c)}
                    >
                      Select
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}