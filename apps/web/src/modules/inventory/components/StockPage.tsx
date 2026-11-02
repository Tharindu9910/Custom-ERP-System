import type { ReactNode } from 'react';
import { Icon } from '@/shared/components/Icon';
import { SearchInput } from '@/shared/components/SearchInput';

/**
 * Page shell of Stock Levels, Restock and Stock Requests, in the queue boards' theme
 * (Docs/decisions/0005, 0012): title + refresh, search on the right, optional buttons,
 * then the page body (banners, status cards, one board).
 */
export function StockPage({
  title,
  scope,
  refreshing,
  onRefresh,
  search,
  onSearch,
  placeholder,
  actions,
  children,
}: {
  title: string;
  /** "All branches" for head office's network view */
  scope?: string;
  refreshing: boolean;
  onRefresh: () => void;
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  /** Buttons after the search box (btn-secondary / btn-primary) */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {scope && <span className="text-sm text-slate-500">{scope}</span>}
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <Icon name="refresh" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
            <div className="w-full lg:w-96">
              <SearchInput value={search} onChange={onSearch} placeholder={placeholder} />
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-8">{children}</main>
    </div>
  );
}

/** A loading / empty row of a board table, as in the queues. */
export function BoardMessageRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-16 text-center text-slate-400">
        {children}
      </td>
    </tr>
  );
}

/** Table head cells of a board table. */
export const TH = 'px-6 py-3 text-left';
export const THEAD = 'bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500';
export const TABLE = 'min-w-full divide-y divide-slate-200';
export const TBODY = 'divide-y divide-slate-100 text-sm';
