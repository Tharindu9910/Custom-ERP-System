import { useState } from 'react';
import { DataTable } from '@/shared/components/DataTable';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { useWorkers, useUpdateWorker, type WorkerDto } from '../hooks/useWorkers';
import { WorkerForm } from './WorkerForm';

export function WorkerList() {
  const { data: workers = [], isLoading } = useWorkers();
  const [editing, setEditing] = useState<WorkerDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<WorkerDto | null>(null);
  const [activating, setActivating] = useState<WorkerDto | null>(null);
  const deactivate = useUpdateWorker(deactivating?.worker_id ?? '');
  const activate = useUpdateWorker(activating?.worker_id ?? '');

  const [showInactive, setShowInactive] = useState(false);
  const visible = showInactive ? workers : workers.filter((w) => w.is_active);

  const columns = [
    { header: 'Name', accessor: (w: WorkerDto) => w.full_name },
    { header: 'Phone', accessor: (w: WorkerDto) => w.phone ?? '—' },
    {
      header: 'Status',
      accessor: (w: WorkerDto) => (
        <StatusBadge status={w.is_active ? 'active' : 'inactive'} />
      ),
    },
    {
      header: '',
      accessor: (w: WorkerDto) => (
        <div className="flex gap-2">
          <button className="text-xs text-blue-600 hover:underline" onClick={() => setEditing(w)}>
            Edit
          </button>
          {w.is_active ? (
            <button
              className="text-xs text-red-500 hover:underline"
              onClick={() => setDeactivating(w)}
            >
              Deactivate
            </button>
          ) : (
            <button
              className="text-xs text-green-600 hover:underline disabled:opacity-50"
              disabled={activate.isPending && activating?.worker_id === w.worker_id}
              onClick={() => {
                setActivating(w);
                activate.mutate({ is_active: true }, { onSuccess: () => setActivating(null) });
              }}
            >
              Activate
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Workers"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            Add Worker
          </button>
        }
      />

      <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <DataTable columns={columns} data={visible} loading={isLoading} />

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-black">
              {editing ? 'Edit Worker' : 'Add Worker'}
            </h2>
            <WorkerForm
              worker={editing ?? undefined}
              onClose={() => { setEditing(null); setCreating(false); }}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deactivating}
        title="Deactivate Worker"
        message={`Deactivate "${deactivating?.full_name}"? They will be hidden from assignment dropdowns but remain on existing records.`}
        confirmLabel="Deactivate"
        isDestructive
        isLoading={deactivate.isPending}
        onConfirm={() => {
          deactivate.mutate(
            { is_active: false },
            { onSuccess: () => setDeactivating(null) },
          );
        }}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}