import { useState } from 'react';
import { CustomerType } from '@erp/shared';
import { DataTable } from '@/shared/components/DataTable';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { PageHeader } from '@/shared/components/PageHeader';
import { useCustomerSearch, useUpdateCustomer, type CustomerDto } from '../hooks/useCustomers';
import { CustomerForm } from './CustomerForm';
import { CustomerSearch } from './CustomerSearch';

export function CustomerList() {
  const [searchPhone, setSearchPhone] = useState('');
  const { data: customers = [], isFetching } = useCustomerSearch(searchPhone);
  const [editing, setEditing] = useState<CustomerDto | null>(null);
  const [creating, setCreating] = useState(false);
  const deactivate = useUpdateCustomer(editing?.customer_id ?? '');

  const columns = [
    { header: 'Name', accessor: (c: CustomerDto) => c.full_name },
    { header: 'Phone', accessor: (c: CustomerDto) => c.phone },
    {
      header: 'Type',
      accessor: (c: CustomerDto) =>
        c.customer_type === CustomerType.BUSINESS ? 'Business' : 'Individual',
    },
    { header: 'Company', accessor: (c: CustomerDto) => c.company_name ?? '—' },
    {
      header: 'Status',
      accessor: (c: CustomerDto) => (
        <StatusBadge status={c.is_active ? 'active' : 'inactive'} />
      ),
    },
    {
      header: '',
      accessor: (c: CustomerDto) => (
        <button className="text-xs text-blue-600 hover:underline" onClick={() => setEditing(c)}>
          Edit
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        action={{ label: 'Add Customer', onClick: () => setCreating(true) }}
      />

      <div className="mb-4">
        <input
          className="input w-full max-w-xs"
          placeholder="Search by phone…"
          value={searchPhone}
          onChange={(e) => setSearchPhone(e.target.value)}
        />
      </div>

      {searchPhone.length < 3 ? (
        <p className="text-sm text-gray-400">Enter at least 3 digits to search customers.</p>
      ) : (
        <DataTable columns={columns} data={customers} loading={isFetching} />
      )}

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