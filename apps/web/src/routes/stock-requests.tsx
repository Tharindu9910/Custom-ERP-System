import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { StockRequestSearch, StockRequestTab } from '@/app/search-params';
import { Icon } from '@/shared/components/Icon';
import { apiError } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { usePermission } from '@/shared/hooks/usePermission';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { usePageScope } from '@/shared/hooks/usePageScope';
import { useAuthStore } from '@/shared/stores/auth.store';
import { NewRequestTab } from '@/modules/stock-transfers/components/NewRequestForm';
import { TransferModal, type TransferModalMode } from '@/modules/stock-transfers/components/TransferModal';
import { TransferRow } from '@/modules/stock-transfers/components/TransferRow';
import { useNetworkTransfers, useStockTransfers, useTransferAction, type TransferDto } from '@/modules/stock-transfers/hooks/useStockTransfers';

/** Head office with "All branches" sees every request; everyone else one branch. */
export function StockRequestsPage() {
  const { isGlobal } = usePageScope();
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  return isGlobal && !activeBranchId ? <NetworkTransfers /> : <BranchStockRequests />;
}

/** Head office: every stock request between branches, read-only (Docs/decisions/0002). */
function NetworkTransfers() {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [viewing, setViewing] = useState<TransferDto | null>(null);
  const { data, isLoading, isFetching, refetch } = useNetworkTransfers({ open: showAll ? 'false' : 'true', q: query.trim() || undefined });
  const rows = data?.rows ?? [];
  const c = data?.counts;
  const kpis = [
    { label: 'Waiting to send', value: c?.waiting, tone: 'text-slate-900' },
    { label: 'On the way', value: c?.sent, tone: c?.sent ? 'text-blue-600' : 'text-slate-900' },
    { label: 'Late', value: c?.late, tone: c?.late ? 'text-rose-600' : 'text-slate-900' },
  ];
  const noop = () => {};

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col overflow-clip bg-slate-50 text-slate-900 antialiased">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stock Requests</h1>
            <span className="text-sm text-slate-500">All branches</span>
            <button type="button" onClick={() => void refetch()} title="Refresh" className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
              <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            {kpis.map((k, i) => (
              <div key={k.label} className={`flex min-w-[90px] flex-col items-center px-5 py-1.5 ${i < kpis.length - 1 ? 'border-r border-slate-200' : ''}`}>
                <span className="mb-1 whitespace-nowrap text-[10px] font-semibold uppercase leading-none tracking-wider text-slate-500">{k.label}</span>
                <span className={`text-lg font-bold leading-none ${k.tone}`}>{k.value ?? '–'}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
        <div className="flex flex-1 flex-col overflow-clip rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Icon name="search" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search request number, branch, or item..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-12 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-blue-600 focus:ring-4 focus:ring-blue-500/5"
              />
            </div>
            <div className="flex items-center gap-1 self-start rounded-lg bg-slate-100 p-1 sm:self-auto">
              {[
                { all: false, label: 'Open' },
                { all: true, label: 'All' },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setShowAll(opt.all)}
                  className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${showAll === opt.all ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 p-4 sm:p-6">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center">
                <p className="font-semibold text-slate-600">No {showAll ? '' : 'open '}requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((t) => (
                  <TransferRow
                    key={t.transfer_id}
                    t={t}
                    readOnly
                    network
                    canSend={false}
                    confirmingCancel={false}
                    busy={false}
                    onSend={noop}
                    onReceive={noop}
                    onView={() => setViewing(t)}
                    onAskCancel={noop}
                    onConfirmCancel={noop}
                    onKeep={noop}
                  />
                ))}
                {data?.has_more && <p className="pt-2 text-center text-xs text-slate-400">Showing the latest 200. Search to find older requests.</p>}
              </div>
            )}
          </div>
        </div>
      </main>

      {viewing && (
        <TransferModal transfer={viewing} mode="view" ourBranchName={viewing.requesting_branch.name} onClose={() => setViewing(null)} onDone={() => setViewing(null)} />
      )}
    </div>
  );
}

/**
 * Stock Requests (prototype): ask another branch for stock, send what others ask
 * us for, and receive what arrives. Each side sees only its own stock (BR06).
 * Head office viewing one branch gets the same lists without actions.
 */
function BranchStockRequests() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as StockRequestSearch;
  const canTransact = useCanTransact();
  const tab: StockRequestTab = search.tab ?? (canTransact ? 'create' : 'toUs');
  const { can } = usePermission();
  const { branch } = useBranchContext();
  const ourBranchName = branch?.name ?? 'our branch';
  const canSend = canTransact && can('send', 'stock');

  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ transfer: TransferDto; mode: TransferModalMode } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const cancel = useTransferAction();

  const listQuery = { open: showAll ? 'false' : 'true', q: query.trim() || undefined } as const;
  const toUs = useStockTransfers({ direction: 'INCOMING', ...listQuery });
  const ours = useStockTransfers({ direction: 'OUTGOING', ...listQuery });
  const c = toUs.data?.counts ?? ours.data?.counts;
  const active = tab === 'toUs' ? toUs : ours;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const setTab = (next: StockRequestTab) => void navigate({ to: '/stock-requests', search: { tab: next } });

  const confirmCancel = async (t: TransferDto) => {
    try {
      await cancel.mutateAsync({ action: 'cancel', id: t.transfer_id });
      setToast({ type: 'success', message: `Request ${t.transfer_number} cancelled.` });
    } catch (e) {
      setToast({ type: 'error', message: apiError(e).message });
    }
    setConfirmCancelId(null);
  };

  const kpis: { label: string; value?: number; tone: string; tab: StockRequestTab }[] = [
    { label: 'Requests to Us', value: c?.to_us, tone: 'text-slate-900', tab: 'toUs' },
    { label: 'Our Requests', value: c?.ours, tone: 'text-slate-900', tab: 'ours' },
    { label: 'To Send', value: c?.to_send, tone: c?.to_send ? 'text-blue-600' : 'text-slate-900', tab: 'toUs' },
    { label: 'To Receive', value: c?.to_receive, tone: c?.to_receive ? 'text-emerald-600' : 'text-slate-900', tab: 'ours' },
  ];

  const renderTab = (key: StockRequestTab, label: string, count?: number) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
        tab === key ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      <span>{label}</span>
      {!!count && <span className="rounded bg-blue-600 px-1.5 font-mono text-[10px] text-white">{count}</span>}
    </button>
  );

  const renderList = (rows: TransferDto[], loading: boolean, empty: { title: string; hint: string }): ReactNode => (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search request number, branch, or item..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-12 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-blue-600 focus:ring-4 focus:ring-blue-500/5"
          />
        </div>
        <div className="flex items-center gap-1 self-start rounded-lg bg-slate-100 p-1 sm:self-auto">
          {[
            { all: false, label: 'Open' },
            { all: true, label: 'All' },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => setShowAll(opt.all)}
              className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${showAll === opt.all ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 p-4 sm:p-6">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-semibold text-slate-600">{empty.title}</p>
            <p className="mt-1 text-xs text-slate-400">{empty.hint}</p>
            {!showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="mt-3 rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Show all requests
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((t) => (
              <TransferRow
                key={t.transfer_id}
                t={t}
                readOnly={!canTransact}
                canSend={canSend}
                confirmingCancel={confirmCancelId === t.transfer_id}
                busy={cancel.isPending}
                onSend={() => setModal({ transfer: t, mode: 'send' })}
                onReceive={() => setModal({ transfer: t, mode: 'receive' })}
                onView={() => setModal({ transfer: t, mode: 'view' })}
                onAskCancel={() => setConfirmCancelId(t.transfer_id)}
                onConfirmCancel={() => void confirmCancel(t)}
                onKeep={() => setConfirmCancelId(null)}
              />
            ))}
            {active.data?.has_more && <p className="pt-2 text-center text-xs text-slate-400">Showing the latest 200. Search to find older requests.</p>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col overflow-clip bg-slate-50 text-slate-900 antialiased">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stock Requests</h1>
            <button
              type="button"
              onClick={() => void Promise.all([toUs.refetch(), ours.refetch()])}
              title="Refresh"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <Icon name="refresh" className={`h-4 w-4 ${toUs.isFetching || ours.isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            {kpis.map((k, i) => (
              <button
                key={k.label}
                type="button"
                onClick={() => setTab(k.tab)}
                className={`flex min-w-[90px] flex-col items-center px-5 py-1.5 transition-colors hover:bg-slate-100/60 ${i < kpis.length - 1 ? 'border-r border-slate-200' : ''}`}
              >
                <span className="mb-1 whitespace-nowrap text-[10px] font-semibold uppercase leading-none tracking-wider text-slate-500">{k.label}</span>
                <span className={`text-lg font-bold leading-none ${k.tone}`}>{k.value ?? '–'}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
        {!!c?.to_send && tab === 'ours' && (
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center">
            <p className="text-sm text-blue-900">
              <strong>
                {c.to_send} request{c.to_send > 1 ? 's' : ''}
              </strong>{' '}
              from other branches {c.to_send > 1 ? 'are' : 'is'} waiting for stock from {ourBranchName}.
            </p>
            <button onClick={() => setTab('toUs')} className="self-start rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700 sm:self-auto">
              Review
            </button>
          </div>
        )}
        {!!c?.to_receive && tab === 'toUs' && (
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center">
            <p className="text-sm text-emerald-900">
              <strong>
                {c.to_receive} {c.to_receive > 1 ? 'deliveries' : 'delivery'}
              </strong>{' '}
              {c.to_receive > 1 ? 'are' : 'is'} on the way to {ourBranchName}. Count and receive {c.to_receive > 1 ? 'them' : 'it'} when{' '}
              {c.to_receive > 1 ? 'they arrive' : 'it arrives'}.
            </p>
            <button onClick={() => setTab('ours')} className="self-start rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 sm:self-auto">
              Open
            </button>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-clip rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 p-3">
            <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-lg bg-slate-200/60 p-1">
              {canTransact && renderTab('create', 'New Request')}
              {renderTab('toUs', 'Requests to Us', c?.to_send)}
              {renderTab('ours', 'Our Requests', c?.to_receive)}
            </div>
            <div className="text-xs font-medium text-slate-500">
              Branch: <span className="font-bold text-slate-800">{ourBranchName}</span>
            </div>
          </div>

          {tab === 'create' && canTransact && (
            <NewRequestTab
              prefill={search.items}
              onCreated={(t) => {
                setToast({ type: 'success', message: `Request ${t.transfer_number} sent to ${t.supplying_branch.name}.` });
                setTab('ours');
              }}
            />
          )}
          {tab === 'toUs' && renderList(toUs.data?.rows ?? [], toUs.isLoading, { title: 'Nothing to send', hint: 'No other branch is waiting for stock from you.' })}
          {tab === 'ours' && renderList(ours.data?.rows ?? [], ours.isLoading, { title: 'No open requests', hint: 'Requests you send to other branches will show here.' })}
        </div>
      </main>

      {modal && (
        <TransferModal
          transfer={modal.transfer}
          mode={modal.mode}
          ourBranchName={ourBranchName}
          onClose={() => setModal(null)}
          onDone={(message) => {
            setModal(null);
            setToast({ type: 'success', message });
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
        >
          <Icon name={toast.type === 'success' ? 'check' : 'alertCircle'} className="h-4 w-4" />
          {toast.message}
        </div>
      )}
    </div>
  );
}
