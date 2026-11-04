import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { StockRequestSearch, StockRequestTab } from '@/app/search-params';
import { apiError } from '@/shared/api/errors';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { BoardSection, StatusCards, type StatusStep } from '@/shared/components/StatusBoard';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { usePageScope } from '@/shared/hooks/usePageScope';
import { usePermission } from '@/shared/hooks/usePermission';
import { TONES } from '@/shared/lib/status-tones';
import { useAuthStore } from '@/shared/stores/auth.store';
import { StockPage } from '@/modules/inventory/components/StockPage';
import { NewRequestModal } from '@/modules/stock-transfers/components/NewRequestForm';
import { TransferModal, type TransferModalMode } from '@/modules/stock-transfers/components/TransferModal';
import { TransferTable } from '@/modules/stock-transfers/components/TransferTable';
import { useNetworkTransfers, useStockTransfers, useTransferAction, type TransferDto } from '@/modules/stock-transfers/hooks/useStockTransfers';

const CLOSED = new Set(['RECEIVED', 'REJECTED', 'CANCELLED']);
const newestFirst = (a: TransferDto, b: TransferDto) => b.created_at.localeCompare(a.created_at);
const lateNote = (rows: TransferDto[]) => {
  const late = rows.filter((t) => t.late).length;
  return late > 0 ? `${late} late` : undefined;
};

/** Head office with "All branches" sees every request; everyone else one branch. */
export function StockRequestsPage() {
  const { isGlobal } = usePageScope();
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  return isGlobal && !activeBranchId ? <NetworkTransfers /> : <BranchStockRequests />;
}

// The branch's requests by what happens next, like Odoo's Transfers overview (Docs/decisions/0012)
const STEPS: StatusStep<StockRequestTab>[] = [
  { key: 'toSend', title: 'To send', icon: 'truck', empty: 'No branch is waiting for stock from you.', tone: TONES.amber },
  { key: 'toReceive', title: 'To receive', icon: 'arrowDownToLine', empty: 'Nothing is on the way to you.', tone: TONES.emerald },
  // Received short: the manager approves the loss or corrects the count (Docs/decisions/0014)
  { key: 'shortages', title: 'Shortages', icon: 'alertTriangle', empty: 'No delivery is waiting for a shortage review.', tone: TONES.amber },
  { key: 'waiting', title: 'Waiting on others', icon: 'clock', empty: 'No request is waiting on another branch.', tone: TONES.slate },
  { key: 'history', title: 'History', icon: 'history', empty: 'No finished requests yet.', tone: TONES.slate },
];

/**
 * Stock Requests (Docs/decisions/0012): the documents that move stock between branches.
 * Cards say what waits on us (send, receive), what waits on the other branch, and the
 * history; new requests open in a popup (or come from Restock). Each side sees only its
 * own stock (BR06). Head office viewing one branch gets the same lists without actions.
 */
function BranchStockRequests() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as StockRequestSearch;
  const canTransact = useCanTransact();
  const { can } = usePermission();
  const { branch } = useBranchContext();
  const ourBranchName = branch?.name ?? 'our branch';
  const canSend = canTransact && can('send', 'stock');
  // A manager may only settle shortages here; asking, cancelling and receiving stay with request:stock
  const canRequest = canTransact && can('request', 'stock');
  const canApprove = canTransact && can('approve', 'transfer_shortage');
  const tab: StockRequestTab = search.tab ?? (canRequest || !canApprove ? 'toSend' : 'shortages');

  const [query, setQuery] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ transfer: TransferDto; mode: TransferModalMode } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancel = useTransferAction();

  const q = query.trim() || undefined;
  const toUs = useStockTransfers({ direction: 'INCOMING', open: 'true', q });
  const ours = useStockTransfers({ direction: 'OUTGOING', open: 'true', q });
  // History loads only when its card is picked
  const history = tab === 'history';
  const toUsAll = useStockTransfers({ direction: 'INCOMING', open: 'false', q }, history);
  const oursAll = useStockTransfers({ direction: 'OUTGOING', open: 'false', q }, history);

  const inOpen = toUs.data?.rows ?? [];
  const outOpen = ours.data?.rows ?? [];
  const lists: Record<StockRequestTab, TransferDto[]> = {
    toSend: inOpen.filter((t) => t.display_status === 'WAITING'),
    toReceive: outOpen.filter((t) => t.display_status === 'SENT'),
    shortages: outOpen.filter((t) => t.display_status === 'SHORT'),
    // What we sent and the other branch still has to receive, or its manager to settle as short
    waiting: [...outOpen.filter((t) => t.display_status === 'WAITING'), ...inOpen.filter((t) => t.display_status === 'SENT' || t.display_status === 'SHORT')].sort(newestFirst),
    history: [...(toUsAll.data?.rows ?? []), ...(oursAll.data?.rows ?? [])].filter((t) => CLOSED.has(t.display_status)).sort(newestFirst),
  };
  const c = toUs.data?.counts ?? ours.data?.counts;
  // Before History loads, its count comes from the branch totals
  const historyCount = history || !c ? lists.history.length : Math.max(0, c.to_us + c.ours - inOpen.length - outOpen.length);
  const current = STEPS.find((s) => s.key === tab)!;
  const loading = history ? toUsAll.isLoading || oursAll.isLoading : toUs.isLoading || ours.isLoading;
  const fetching = toUs.isFetching || ours.isFetching || toUsAll.isFetching || oursAll.isFetching;

  const go = (next: Partial<StockRequestSearch>) => void navigate({ to: '/stock-requests', search: { tab, ...next } });
  const setTab = (next: StockRequestTab) => {
    setConfirmCancelId(null);
    go({ tab: next });
  };

  const confirmCancel = async (t: TransferDto) => {
    setDone(null);
    setError(null);
    try {
      await cancel.mutateAsync({ action: 'cancel', id: t.transfer_id });
      setDone(`Request ${t.transfer_number} cancelled.`);
    } catch (e) {
      setError(apiError(e).message);
    }
    setConfirmCancelId(null);
  };

  return (
    <StockPage
      title="Stock Requests"
      refreshing={fetching}
      onRefresh={() => void Promise.all([toUs.refetch(), ours.refetch(), ...(history ? [toUsAll.refetch(), oursAll.refetch()] : [])])}
      search={query}
      onSearch={setQuery}
      placeholder="Search request number, branch, or item..."
      actions={
        canRequest && (
          <button onClick={() => go({ new: true })} className="btn-primary whitespace-nowrap">
            <Icon name="plus" className="h-4 w-4" />
            New Request
          </button>
        )
      }
    >
      {done && <Notice tone="success">{done}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <StatusCards
        steps={STEPS}
        value={tab}
        onChange={setTab}
        loading={toUs.isLoading || ours.isLoading}
        counts={{ toSend: lists.toSend.length, toReceive: lists.toReceive.length, shortages: lists.shortages.length, waiting: lists.waiting.length, history: historyCount }}
        sub={{ toSend: lateNote(lists.toSend), toReceive: lateNote(lists.toReceive), waiting: lateNote(lists.waiting) }}
        arrowAfter={() => false}
      />

      <BoardSection title={current.title} count={lists[tab].length}>
        <TransferTable
          rows={lists[tab]}
          loading={loading}
          empty={q ? `No ${current.title.toLowerCase()} requests match “${q}”.` : current.empty}
          readOnly={!canTransact}
          canSend={canSend}
          canRequest={canRequest}
          canApprove={canApprove}
          confirmingCancelId={confirmCancelId}
          busy={cancel.isPending}
          onSend={(t) => setModal({ transfer: t, mode: 'send' })}
          onReceive={(t) => setModal({ transfer: t, mode: 'receive' })}
          onReviewShortage={(t) => setModal({ transfer: t, mode: 'shortage' })}
          onView={(t) => setModal({ transfer: t, mode: 'view' })}
          onAskCancel={(t) => setConfirmCancelId(t.transfer_id)}
          onConfirmCancel={(t) => void confirmCancel(t)}
          onKeep={() => setConfirmCancelId(null)}
        />
        {(history ? toUsAll.data?.has_more || oursAll.data?.has_more : toUs.data?.has_more || ours.data?.has_more) && (
          <p className="border-t border-slate-100 py-3 text-center text-xs text-slate-400">Showing the latest 200. Search to find older requests.</p>
        )}
      </BoardSection>

      {search.new && canRequest && (
        <NewRequestModal
          prefill={search.items}
          onClose={() => go({ new: undefined, items: undefined })}
          onCreated={(t) => {
            setError(null);
            setDone(`Request ${t.transfer_number} sent to ${t.supplying_branch.name}.`);
            go({ tab: 'waiting', new: undefined, items: undefined });
          }}
        />
      )}
      {modal && (
        <TransferModal
          transfer={modal.transfer}
          mode={modal.mode}
          ourBranchName={ourBranchName}
          onClose={() => setModal(null)}
          onDone={(message) => {
            setModal(null);
            setError(null);
            setDone(message);
          }}
        />
      )}
    </StockPage>
  );
}

type NetworkTab = 'waiting' | 'sent' | 'short' | 'late' | 'history';

const NETWORK_STEPS: StatusStep<NetworkTab>[] = [
  { key: 'waiting', title: 'Waiting to send', icon: 'clock', empty: 'No request is waiting to be sent.', tone: TONES.amber },
  { key: 'sent', title: 'On the way', icon: 'truck', empty: 'Nothing is on the way.', tone: TONES.blue },
  { key: 'short', title: 'Arrived short', icon: 'alertTriangle', empty: 'No delivery is waiting for a shortage review.', tone: TONES.amber },
  { key: 'late', title: 'Late', icon: 'alertTriangle', empty: 'No open request is past its needed-by date.', tone: TONES.amber },
  { key: 'history', title: 'History', icon: 'history', empty: 'No finished requests yet.', tone: TONES.slate },
];

/** Head office: every stock request between branches, read-only (Docs/decisions/0002). */
function NetworkTransfers() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<NetworkTab>('waiting');
  const [viewing, setViewing] = useState<TransferDto | null>(null);
  const q = query.trim() || undefined;
  const open = useNetworkTransfers({ open: 'true', q });
  // Head office is read-only and rarely here: load history up front so every card has its count
  const all = useNetworkTransfers({ open: 'false', q });
  const rows = open.data?.rows ?? [];
  const lists: Record<NetworkTab, TransferDto[]> = {
    waiting: rows.filter((t) => t.display_status === 'WAITING'),
    sent: rows.filter((t) => t.display_status === 'SENT'),
    short: rows.filter((t) => t.display_status === 'SHORT'),
    late: rows.filter((t) => t.late),
    history: (all.data?.rows ?? []).filter((t) => CLOSED.has(t.display_status)),
  };
  const current = NETWORK_STEPS.find((s) => s.key === tab)!;
  const source = tab === 'history' ? all : open;

  return (
    <StockPage
      title="Stock Requests"
      scope="All branches"
      refreshing={open.isFetching || all.isFetching}
      onRefresh={() => void Promise.all([open.refetch(), all.refetch()])}
      search={query}
      onSearch={setQuery}
      placeholder="Search request number, branch, or item..."
    >
      <StatusCards
        steps={NETWORK_STEPS}
        value={tab}
        onChange={setTab}
        loading={open.isLoading}
        counts={{ waiting: lists.waiting.length, sent: lists.sent.length, short: lists.short.length, late: lists.late.length, history: lists.history.length }}
        arrowAfter={(key) => key === 'waiting'}
      />

      <BoardSection title={current.title} count={lists[tab].length}>
        <TransferTable
          rows={lists[tab]}
          loading={source.isLoading}
          empty={q ? `No ${current.title.toLowerCase()} requests match “${q}”.` : current.empty}
          readOnly
          network
          onView={setViewing}
        />
        {source.data?.has_more && <p className="border-t border-slate-100 py-3 text-center text-xs text-slate-400">Showing the latest 200. Search to find older requests.</p>}
      </BoardSection>

      {viewing && (
        <TransferModal transfer={viewing} mode="view" ourBranchName={viewing.requesting_branch.name} onClose={() => setViewing(null)} onDone={() => setViewing(null)} />
      )}
    </StockPage>
  );
}
