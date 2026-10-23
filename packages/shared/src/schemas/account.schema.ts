import { z } from 'zod';

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
