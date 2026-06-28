import { useState } from 'react';
import { DataTable } from '@/shared/components/DataTable';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { useBranches, useUpdateBranch, type BranchDto } from '../hooks/useBranches';
import { BranchForm } from './BranchForm';

function BranchActions({
  branch,
  onEdit,
  onDeactivate,
}: {
  branch: BranchDto;
  onEdit: (b: BranchDto) => void;
  onDeactivate: (b: BranchDto) => void;
}) {
  const reactivate = useUpdateBranch(branch.branch_id);
  return (
    <div className="flex gap-2">
      <button className="text-xs text-blue-600 hover:underline" onClick={() => onEdit(branch)}>
        Edit
      </button>
      {branch.is_active ? (
        <button className="text-xs text-red-500 hover:underline" onClick={() => onDeactivate(branch)}>
          Deactivate
        </button>
      ) : (
        <button
          className="text-xs text-green-600 hover:underline"
          onClick={() => reactivate.mutate({ is_active: true })}
          disabled={reactivate.isPending}
        >
          Reactivate
        </button>
      )}
    </div>
  );
}

export function BranchList() {
  const { data: branches = [], isLoading } = useBranches();
  const [editing, setEditing] = useState<BranchDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<BranchDto | null>(null);

  const deactivateMutation = useUpdateBranch(deactivating?.branch_id ?? '');

  const columns = [
    { header: 'Name', accessor: (b: BranchDto) => b.name },
    { header: 'Address', accessor: (b: BranchDto) => b.address ?? '—' },
    { header: 'Phone', accessor: (b: BranchDto) => b.phone ?? '—' },
    {
      header: 'Status',
      accessor: (b: BranchDto) => (
        <StatusBadge status={b.is_active ? 'active' : 'inactive'} />
      ),
    },
    {
      id: 'actions',
      header: '',
      accessor: (b: BranchDto) => (
        <BranchActions branch={b} onEdit={setEditing} onDeactivate={setDeactivating} />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Branches"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            Add Branch
          </button>
        }
      />

      <DataTable columns={columns} data={branches} loading={isLoading} />

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-black">
              {editing ? 'Edit Branch' : 'Add Branch'}
            </h2>
            <BranchForm
              branch={editing ?? undefined}
              onClose={() => {
                setEditing(null);
                setCreating(false);
              }}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deactivating}
        title="Deactivate Branch"
        message={`Deactivate "${deactivating?.name}"? Users assigned to this branch will not be able to operate.`}
        confirmLabel="Deactivate"
        isDestructive
        isLoading={deactivateMutation.isPending}
        onConfirm={() => {
          deactivateMutation.mutate(
            { is_active: false },
            { onSuccess: () => setDeactivating(null) },
          );
        }}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}