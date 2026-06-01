# Seed Credentials — Development Only

These users are created by `pnpm --filter api seed`. All passwords are dev-only.
Do **not** use these in production.

| Username      | Password      | Role        | Branch      |
|---------------|---------------|-------------|-------------|
| superadmin    | Super@123     | SUPER_ADMIN | null (global) |
| manager1      | Manager@123   | MANAGER     | null (global) |
| admin1        | Admin@123     | ADMIN       | placeholder |
| supervisor1   | Super1@123    | SUPERVISOR  | placeholder |
| cashier1      | Cashier@123   | CASHIER     | placeholder |

`placeholder branch_id = 00000000-0000-0000-0000-000000000001`
Will be replaced when the BRANCH module is built in a later step.