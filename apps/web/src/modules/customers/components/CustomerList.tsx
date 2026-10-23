import { useEffect, useState } from 'react';
import { CustomerType } from '@erp/shared';
import { DataTable } from '@/shared/components/DataTable';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { PageHeader } from '@/shared/components/PageHeader';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { useCustomers, type CustomerDto } from '../hooks/useCustomers';
import { CustomerForm } from './CustomerForm';
import { CustomerSearch } from './CustomerSearch';

export function CustomerList() {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  // Wait for a short pause in typing before querying
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { data: customers = [], isLoading, isFetching } = useCustomers(term);
  const [editing, setEditing] = useState<CustomerDto | null>(null);
  const [creating, setCreating] = useState(false);
  // Head office views customers; branch staff add and edit them
  const canTransact = useCanTransact();

  const columns = [
    { header: 'Name', accessor: (c: CustomerDto) => c.name },
    { header: 'Phone', accessor: (c: CustomerDto) => c.phone },
    {
      header: 'Type',
      accessor: (c: CustomerDto) =>
        c.customer_type === CustomerType.BUSINESS ? 'Business' : 'Individual',
    },
    { header: 'Company', accessor: (c: CustomerDto) => c.company_name ?? '—' },
    {
      header: 'Profile',
      accessor: (c: CustomerDto) => (
        <StatusBadge status={c.completed_at ? 'COMPLETED' : 'PENDING'} />
      ),
    },
    {
      header: '',
      accessor: (c: CustomerDto) =>
        canTransact ? (
          <button className="text-xs text-blue-600 hover:underline" onClick={() => setEditing(c)}>
            Edit
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        actions={
          canTransact && (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              Add Customer
            </button>
          )
        }
      />

      <div className="mb-4">
        <input
          className="input w-full max-w-xs"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        data={customers}
        loading={isLoading || (isFetching && customers.length === 0)}
        emptyMessage={term ? 'No customers match your search.' : 'No customers yet.'}
      />

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">
              {editing ? 'Edit Customer' : 'Add Customer'}
            </h2>
            <CustomerForm
              customer={editing ?? undefined}
              onClose={() => { setEditing(null); setCreating(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export { CustomerSearch };