import { Role } from '@erp/shared';

export class RequestUser {
  user_id: string;
  jti: string;
  username: string;
  role: Role;
  branch_id: string | null;
  /** Temporary password in use — only password change is allowed until it is replaced. */
  must_change_password?: boolean;
}
