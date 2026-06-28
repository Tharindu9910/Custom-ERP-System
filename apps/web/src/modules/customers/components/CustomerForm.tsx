import { useState } from 'react';
import { CustomerType } from '@erp/shared';
import { FormField } from '@/shared/components/FormField';
import { useCreateCustomer, useUpdateCustomer, type CustomerDto } from '../hooks/useCustomers';

interface Props {
  customer?: CustomerDto;
  onClose: () => void;
}

const CUSTOMER_TYPES: { label: string; value: CustomerType }[] = [
  { label: 'Individual', value: CustomerType.INDIVIDUAL },
  { label: 'Business', value: CustomerType.BUSINESS },
];

export function CustomerForm({ customer, onClose }: Props) {
  const isEdit = !!customer;
  const create = useCreateCustomer();
  const update = useUpdateCustomer(customer?.customer_id ?? '');

  const [fullName, setFullName] = useState(customer?.full_name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [companyName, setCompanyName] = useState(customer?.company_name ?? '');
  const [contactPerson, setContactPerson] = useState(customer?.contact_person ?? '');
  const [customerType, setCustomerType] = useState<CustomerType>(
    customer?.customer_type ?? CustomerType.INDIVIDUAL,
  );
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        await update.mutateAsync({
          full_name: fullName,
          email: email || undefined,
          address: address || undefined,
          customer_type: customerType,
          company_name: companyName || undefined,
          contact_person: contactPerson || undefined,
        });
      } else {
        await create.mutateAsync({ full_name: fullName, phone });
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

      <FormField label="Phone" required={!isEdit}>
        <input
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isEdit}
          required={!isEdit}
        />
      </FormField>

      <FormField label="Customer Type">
        <select
          className="input"
          value={customerType}
          onChange={(e) => setCustomerType(e.target.value as CustomerType)}
        >
          {CUSTOMER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </FormField>

      {(customerType === CustomerType.BUSINESS || isEdit) && (
        <>
          <FormField label="Company Name">
            <input
              className="input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </FormField>
          <FormField label="Contact Person">
            <input
              className="input"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          </FormField>
        </>
      )}

      <FormField label="Email">
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>

      <FormField label="Address">
        <textarea
          className="input"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </FormField>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
        </button>
      </div>
    </form>
  );
}