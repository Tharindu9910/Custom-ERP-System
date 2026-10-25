import { useState } from 'react';
import { ItemType, type ItemPriceView, type PriceRateView } from '@erp/shared';
import { apiError } from '@/shared/api/errors';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { DataTable } from '@/shared/components/DataTable';
import { Notice } from '@/shared/components/Notice';
import { PageHeader } from '@/shared/components/PageHeader';
import { SearchInput } from '@/shared/components/SearchInput';
import { SegmentedTabs } from '@/shared/components/SegmentedTabs';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { usePermission } from '@/shared/hooks/usePermission';
import { useItemPrices, usePriceRates, useUpdateItemPrice, useUpdateRate } from '../hooks/usePriceList';
import { BASIS_LABEL, LINE_TYPE_LABEL, RATE_LINE_TYPES, describeRate } from '../lib/price-labels';
import { AddRateModal } from './AddRateModal';
import { PriceInput } from './PriceInput';

type Tab = 'rates' | 'items';

/**
 * Settings → Price List. One list for every branch (Docs/decisions/0004).
 * Managers and head office edit it; the Auditor only views. Saved orders keep their prices.
 */
export function PriceListPanel() {
  const [tab, setTab] = useState<Tab>('rates');
  return (
    <div>
      <PageHeader title="Price List" subtitle="One price list for every branch. Changes apply to new quotes and orders only." />
      <div className="mb-4">
        <SegmentedTabs<Tab>
          tabs={[
            { key: 'rates', label: 'Work rates' },
            { key: 'items', label: 'Item prices' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'rates' ? <RatesTab /> : <ItemsTab />}
    </div>
  );
}

function RatesTab() {
  const { can } = usePermission();
  const canEdit = can('configure', 'price_list');
  const [lineType, setLineType] = useState<(typeof RATE_LINE_TYPES)[number]>(RATE_LINE_TYPES[0]);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<PriceRateView | null>(null);
  const [error, setError] = useState('');
  const { data: rates = [], isLoading } = usePriceRates({ line_type: lineType, include_inactive: showInactive });
  const update = useUpdateRate();

  const save = (id: string, payload: { rate?: number; is_active?: boolean }, done?: () => void) => {
    setError('');
    update.mutate({ id, ...payload }, { onSuccess: done, onError: (e) => setError(apiError(e).message) });
  };

  const columns = [
    { header: 'Rate for', accessor: (r: PriceRateView) => <span className="text-gray-900">{describeRate(r)}</span> },
    {
      header: 'Rate',
      accessor: (r: PriceRateView) => (
        <PriceInput
          cents={r.rate}
          label={`rate for ${describeRate(r)}`}
          editable={canEdit && r.is_active}
          saving={update.isPending && update.variables?.id === r.rate_id}
          onSave={(rate) => save(r.rate_id, { rate })}
        />
      ),
    },
    { header: 'Charged', accessor: (r: PriceRateView) => BASIS_LABEL[r.price_basis] },
    { header: 'Status', accessor: (r: PriceRateView) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    {
      header: '',
      id: 'actions',
      accessor: (r: PriceRateView) =>
        canEdit &&
        (r.is_active ? (
          <button className="text-xs text-red-500 hover:underline" onClick={() => setDeactivating(r)}>
            Deactivate
          </button>
        ) : (
          <button
            className="text-xs text-green-600 hover:underline disabled:opacity-50"
            disabled={update.isPending}
            onClick={() => save(r.rate_id, { is_active: true })}
          >
            Activate
          </button>
        )),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {RATE_LINE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLineType(t)}
              className={
                t === lineType
                  ? 'rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white'
                  : 'rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-200'
              }
            >
              {LINE_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          {canEdit && (
            <button className="btn-primary" onClick={() => setAdding(true)}>
              Add Rate
            </button>
          )}
        </div>
      </div>

      {error && <Notice tone="error" className="mb-3">{error}</Notice>}
      {canEdit && (
        <p className="mb-3 text-xs text-gray-500">
          Click a rate to change it. A job with no matching rate is priced by hand (customized).
        </p>
      )}

      <DataTable columns={columns} data={rates} loading={isLoading} emptyMessage="No rates for this work type yet." />

      {adding && <AddRateModal open initialLineType={lineType} onClose={() => setAdding(false)} />}

      <ConfirmDialog
        open={!!deactivating}
        title="Deactivate Rate"
        message={`Stop using the rate for "${deactivating ? describeRate(deactivating) : ''}"? New jobs of this kind will need a hand-entered price until a rate is added again.`}
        confirmLabel="Deactivate"
        isDestructive
        isLoading={update.isPending}
        onConfirm={() => deactivating && save(deactivating.rate_id, { is_active: false }, () => setDeactivating(null))}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}

const ITEM_TYPE_TABS: { key: ItemType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: ItemType.MATERIAL, label: 'Materials' },
  { key: ItemType.COIL, label: 'Coils' },
  { key: ItemType.HARDWARE, label: 'Hardware' },
];

function ItemsTab() {
  const { can } = usePermission();
  const canEdit = can('configure', 'item_prices');
  const [itemType, setItemType] = useState<ItemType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [error, setError] = useState('');
  const { data: items = [], isLoading } = useItemPrices({ item_type: itemType === 'ALL' ? undefined : itemType, q: q || undefined });
  const update = useUpdateItemPrice();

  const save = (id: string, payload: { price?: number; unit_cost?: number }) => {
    setError('');
    update.mutate({ id, ...payload }, { onError: (e) => setError(apiError(e).message) });
  };
  const saving = (i: ItemPriceView) => update.isPending && update.variables?.id === i.item_id;

  const columns = [
    { header: 'SKU', accessor: (i: ItemPriceView) => <span className="font-mono text-xs text-gray-500">{i.sku}</span> },
    { header: 'Item', accessor: (i: ItemPriceView) => <span className="text-gray-900">{i.name}</span> },
    { header: 'Category', accessor: (i: ItemPriceView) => i.category ?? '—' },
    { header: 'Unit', accessor: (i: ItemPriceView) => i.unit },
    {
      header: 'Selling price',
      accessor: (i: ItemPriceView) => (
        <PriceInput cents={i.price} label={`selling price of ${i.name}`} editable={canEdit} saving={saving(i)} onSave={(price) => save(i.item_id, { price })} />
      ),
    },
    {
      header: 'Cost',
      accessor: (i: ItemPriceView) => (
        <PriceInput cents={i.unit_cost} label={`cost of ${i.name}`} editable={canEdit} saving={saving(i)} onSave={(unit_cost) => save(i.item_id, { unit_cost })} />
      ),
    },
    { header: 'Status', accessor: (i: ItemPriceView) => <StatusBadge status={i.is_active ? 'active' : 'inactive'} /> },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SegmentedTabs tabs={ITEM_TYPE_TABS} value={itemType} onChange={setItemType} />
        <div className="min-w-[240px] flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, SKU or category" />
        </div>
      </div>
      {error && <Notice tone="error" className="mb-3">{error}</Notice>}
      {canEdit && <p className="mb-3 text-xs text-gray-500">Click a price to change it. Material sheet prices are used for Cut &amp; Bend jobs.</p>}
      <DataTable columns={columns} data={items} loading={isLoading} emptyMessage="No items found." />
    </div>
  );
}
