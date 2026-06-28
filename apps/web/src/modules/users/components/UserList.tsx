import { useState } from 'react';
import { DataTable } from '@/shared/components/DataTable';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { useUsers, useUpdateUser, type UserDto } from '../hooks/useUsers';
import { UserForm } from './UserForm';

export function UserList() {
  const { data: users = [], isLoading } = useUsers();
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<UserDto | null>(null);
  const [activating, setActivating] = useState<UserDto | null>(null);

  const deactivateUser = useUpdateUser(deactivating?.user_id ?? '');
  const activateUser = useUpdateUser(activating?.user_id ?? '');

  const columns = [
    { header: 'Name', accessor: (u: UserDto) => u.full_name },
    { header: 'Username', accessor: (u: UserDto) => u.username },
    { header: 'Role', accessor: (u: UserDto) => u.role?.replace('_', ' ') ?? '—' },
    { header: 'Email', accessor: (u: UserDto) => u.email ?? '—' },
    { header: 'Phone', accessor: (u: UserDto) => u.phone ?? '—' },
    { header: 'Branch', accessor: (u: UserDto) => u.branch_id ?? 'Cross-branch' },
    {
      header: 'Created',
      accessor: (u: UserDto) => new Date(u.created_at).toLocaleDateString(),
    },
    {
      header: 'Last Login',
      accessor: (u: UserDto) =>
        u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—',
    },
    {
      header: 'Status',
      accessor: (u: UserDto) => (
        <StatusBadge status={u.is_active ? 'active' : 'inactive'} />
      ),
    },
    {
      header: '',
      accessor: (u: UserDto) => (
        <div className="flex gap-2">
          <button className="text-xs text-blue-600 hover:underline" onClick={() => setEditing(u)}>
            Edit
          </button>
          {u.is_active ? (
            <button
              className="text-xs text-red-500 hover:underline"
              onClick={() => setDeactivating(u)}
            >
              Deactivate
            </button>
          ) : (
            <button
              className="text-xs text-green-600 hover:underline"
              disabled={activateUser.isPending && activating?.user_id === u.user_id}
              onClick={() => {
                setActivating(u);
                activateUser.mutate({ is_active: true }, { onSuccess: () => setActivating(null) });
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
        title="Users"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            Add User
          </button>
        }
      />

      <DataTable columns={columns} data={users} loading={isLoading} />

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">
              {editing ? 'Edit User' : 'Add User'}
            </h2>
            <UserForm
              user={editing ?? undefined}
              onClose={() => { setEditing(null); setCreating(false); }}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deactivating}
        title="Deactivate User"
        message={`Deactivate "${deactivating?.full_name}"? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        isDestructive
        isLoading={deactivateUser.isPending}
        onConfirm={() => {
          deactivateUser.mutate(
            { is_active: false },
            { onSuccess: () => setDeactivating(null) },
          );
        }}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}