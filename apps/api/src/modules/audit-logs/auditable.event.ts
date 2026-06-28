import { Role } from '@erp/shared';

export class AuditableEvent {
  constructor(
    public readonly entity_type: string,
    public readonly action: string,
    public readonly actor_id: string,
    public readonly actor_role: Role | null,
    public readonly entity_id?: string,
    public readonly branch_id?: string,
    public readonly before?: Record<string, unknown>,
    public readonly after?: Record<string, unknown>,
    public readonly entity_version?: number,
  ) {}
}
