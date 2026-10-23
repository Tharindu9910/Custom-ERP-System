import { z } from 'zod';
import { CustomerType } from '../enums/customer-type.enum';

const CustomerFieldsSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number'),
  customer_type: z.nativeEnum(CustomerType).optional(),
  company_name: z.string().max(120).optional(),
  contact_person: z.string().max(120).optional(),
  email: z.string().email().optional(),
  address: z.string().max(255).optional(),
});

const requireCompanyForBusiness = (c: {
  customer_type?: CustomerType;
  company_name?: string;
}) => c.customer_type !== CustomerType.BUSINESS || !!c.company_name;

export const CreateCustomerSchema = CustomerFieldsSchema.refine(requireCompanyForBusiness, {
  message: 'company_name is required for BUSINESS customers',
  path: ['company_name'],
});

// Partial update: the BUSINESS/company_name rule is checked against the merged
// record in the service (and by the DB CHECK constraint).
export const UpdateCustomerSchema = CustomerFieldsSchema.partial();

export type CreateCustomerDto = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof UpdateCustomerSchema>;
