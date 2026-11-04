import { z } from 'zod';
import { Role } from '../enums/role.enum';

export const CreateChiefSchema = z.object({
  employee_id: z.string().uuid({ message: 'Select an employee' }),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});
export type CreateChiefDto = z.infer<typeof CreateChiefSchema>;

export const PASSWORD_RULES = 'At least 8 characters, with an upper-case letter, a lower-case letter and a number.';

export const NewPasswordSchema = z
  .string()
  .min(8, PASSWORD_RULES)
  .max(128)
  .regex(/[A-Z]/, PASSWORD_RULES)
  .regex(/[a-z]/, PASSWORD_RULES)
  .regex(/[0-9]/, PASSWORD_RULES);

export const ChangePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password'),
    new_password: NewPasswordSchema,
  })
  .refine((v) => v.current_password !== v.new_password, {
    message: 'Choose a password different from the current one',
    path: ['new_password'],
  });
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

// ── System users (Users page) ─────────────────────────────────────────────
// Unknown keys are stripped (not refused) so existing clients keep working.
// A blank optional field means "not given", as the Users form sends.
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).nullable().optional());
// guid, not uuid(): Zod 4's uuid() wants an RFC variant and the seeded branch ids (00000000-…-0001) aren't
const optionalBranchId = z.preprocess(blankToUndefined, z.guid().nullable().optional());

export const CreateUserSchema = z.object({
  username: z.string().trim().min(1, 'Enter a username').max(100),
  password: z.string().min(1, 'Enter a password').max(128),
  full_name: z.string().trim().min(1, 'Enter the full name').max(120),
  email: optionalText(254),
  phone: optionalText(30),
  branch_id: optionalBranchId,
  role: z.nativeEnum(Role),
});
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

// On edit a blank email/phone clears it (null), as before
const clearableText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable().optional());

export const UpdateUserSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter the full name').max(120).optional(),
  email: clearableText(254),
  phone: clearableText(30),
  is_active: z.boolean().optional(),
});
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

export const AssignRoleSchema = z.object({
  role: z.nativeEnum(Role),
  branch_id: optionalBranchId,
});
export type AssignRoleDto = z.infer<typeof AssignRoleSchema>;

export const UpdateRolePermissionsSchema = z.object({
  role: z.nativeEnum(Role).refine((r) => r !== Role.SUPER_ADMIN, 'SUPER_ADMIN always has every permission'),
  updates: z.array(z.object({ permission_id: z.string().uuid(), granted: z.boolean() })).min(1).max(500),
});
export type UpdateRolePermissionsDto = z.infer<typeof UpdateRolePermissionsSchema>;

export const LoginBodySchema = z.object({
  username: z.string().min(1, 'Enter your username').max(100),
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginBodyDto = z.infer<typeof LoginBodySchema>;

export const ChiefCandidatesQuerySchema = z.object({ search: z.string().max(100).optional() });
