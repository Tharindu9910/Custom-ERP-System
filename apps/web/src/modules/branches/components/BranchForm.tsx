import { useState } from 'react';
import { FormField } from '@/shared/components/FormField';
import { useCreateBranch, useUpdateBranch, type BranchDto } from '../hooks/useBranches';

interface Props {
  branch?: BranchDto;
  onClose: () => void;
}

export function BranchForm({ branch, onClose }: Props) {
  const isEdit = !!branch;
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch(branch?.branch_id ?? '');

  const [form, setForm] = useState({
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? '',
  });
  const [error, setError] = useState('');

  const set = (field: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        await updateBranch.mutateAsync({
          name: form.name,
          address: form.address || undefined,
          phone: form.phone || undefined,
        });
      } else {
        await createBranch.mutateAsync({
          name: form.name,
          address: form.address || undefined,
          phone: form.phone || undefined,
        });
      }
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? 'An error occurred';
      setError(msg);
    }
  };

  const isPending = createBranch.isPending || updateBranch.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Branch Name" required>
        <input
          className="input"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          required
        />
      </FormField>

      <FormField label="Address">
        <input
          className="input"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
        />
      </FormField>

      <FormField label="Phone">
        <input
          className="input"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
        />
      </FormField>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Branch'}
        </button>
      </div>
    </form>
  );
}