import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditableEvent } from '../modules/audit-logs/auditable.event';
import type { Actor } from '../common/actor';

/** Records an audit entry (with the actor's role at the time, BR22). Never throws. */
@Injectable()
export class AuditService {
  constructor(private readonly events: EventEmitter2) {}

  record(
    actor: Pick<Actor, 'user_id' | 'role' | 'branch_id'>,
    entity: { type: string; id?: string; version?: number },
    action: string,
    change: { before?: Record<string, unknown>; after?: Record<string, unknown> } = {},
  ): void {
    this.events.emit(
      'audit',
      new AuditableEvent(
        entity.type,
        action,
        actor.user_id,
        actor.role,
        entity.id,
        actor.branch_id,
        change.before,
        change.after,
        entity.version,
      ),
    );
  }
}
