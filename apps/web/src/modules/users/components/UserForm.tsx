import { useState } from 'react';
import { Role } from '@erp/shared';
import { FormField } from '@/shared/components/FormField';
import {
  useCreateUser,
  useUpdateUser,
  useAssignRole,
  type UserDto,
  type CreateUserPayload,
} from '../hooks/useUsers';
import { useBranches } from '@/modules/branches/hooks/useBranches';

interface Props {
  user?: UserDto;
  onClose: () => void;
}

const ROLES: Role[] = [
  Role.ADMIN, Role.AUDITOR, Role.SUPERVISOR, Role.CHIEF, Role.CASHIER, Role.MANAGER,
];

export function UserForm({ user, onClose }: Props) {
  const isEdit = !!user;
  const { data: branches = [] } = useBranches();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser(user?.user_id ?? '');
  const assignRole = useAssignRole(user?.user_id ?? '');

  const [form, setForm] = useState<CreateUserPayload>({
    username: user?.username ?? '',
    password: '',
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    branch_id: user?.branch_id ?? '',
    role: user?.role ?? Role.CASHIER,
  });
  const [error, setError] = useState('');

  const set = (field: keyof CreateUserPayload, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        await updateUser.mutateAsync({
          full_name: form.full_name,
          email: form.email || undefined,
          phone: form.phone || undefined,
        });
        await assignRole.mutateAsync({
          role: form.role,
          branch_id: form.branch_id || undefined,
        });
      } else {
        await createUser.mutateAsync(form);
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'An error occurred';
      setError(msg);
    }
  };

  const isPending = createUser.isPending || updateUser.isPending || assignRole.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Full Name" required>
        <input
          className="input"
          value={form.full_name}
          onChange={(e) => set('full_name', e.target.value)}
          required
        />
      </FormField>

      {!isEdit && (
        <>
          <FormField label="Username" required>
            <input
              className="input"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              required
            />
          </FormField>
          <FormField label="Password" required>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              required
            />
          </FormField>
        </>
      )}

      <FormField label="Email">
        <input
          type="email"
          className="input"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </FormField>

      <FormField label="Phone">
        <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </FormField>

      <FormField label="Role" required>
        <select
          className="input"
          value={form.role}
          onChange={(e) => set('role', e.target.value)}
          required
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{r.replace('_', ' ')}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Branch">
        <select
          className="input"
          value={form.branch_id}
          onChange={(e) => set('branch_id', e.target.value)}
        >
          <option value="">— Cross-branch (no branch) —</option>
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>{b.name}</option>
          ))}
        </select>
      </FormField>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
        </button>
      </div>
    </form>
  );
}