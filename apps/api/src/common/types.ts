import { Role } from '@erp/shared'

export class RequestUser {
  user_id: string
  jti: string
  username: string
  role: Role
  branch_id: string | null
}