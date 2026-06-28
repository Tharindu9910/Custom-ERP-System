import { z } from 'zod';
import { CustomerType } from '../enums/customer-type.enum';

export const CreateCustomerSchema = z.object({
  full_name: z.string().min(1).max(120),
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number'),
  customer_type: z.nativeEnum(CustomerType).optional(),
  company_name: z.string().max(120).optional(),
  contact_person: z.string().max(120).optional(),
  email: z.string().email().optional(),
  address: z.string().max(255).optional(),
});

export const UpdateCustomerSchema = CreateCustomerSchema.partial();

export type CreateCustomerDto = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof UpdateCustomerSchema>;
