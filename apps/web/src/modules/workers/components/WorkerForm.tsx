import { useState } from 'react';
import { FormField } from '@/shared/components/FormField';
import { useCreateWorker, useUpdateWorker, type WorkerDto } from '../hooks/useWorkers';

interface Props {
  worker?: WorkerDto;
  onClose: () => void;
}

export function WorkerForm({ worker, onClose }: Props) {
  const isEdit = !!worker;
  const create = useCreateWorker();
  const update = useUpdateWorker(worker?.worker_id ?? '');

  const [fullName, setFullName] = useState(worker?.full_name ?? '');
  const [phone, setPhone] = useState(worker?.phone ?? '');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        await update.mutateAsync({ full_name: fullName, phone: phone || undefined });
      } else {
        await create.mutateAsync({ full_name: fullName, phone: phone || undefined });
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'An error occurred';
      setError(msg);
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Full Name" required>
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </FormField>
      <FormField label="Phone">
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </FormField>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Worker'}
        </button>
      </div>
    </form>
  );
}