import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { AuditableEvent } from './auditable.event';

@Injectable()
export class AuditLogListener {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  @OnEvent('audit', { async: true })
  async handle(event: AuditableEvent): Promise<void> {
    try {
      await this.repo.save({
        entity_type: event.entity_type,
        action: event.action,
        actor_id: event.actor_id,
        actor_role: event.actor_role,
        entity_id: event.entity_id,
        branch_id: event.branch_id,
        before: event.before,
        after: event.after,
        entity_version: event.entity_version,
      });
    } catch {
      // Audit failures never propagate — business ops must not roll back for audit
    }
  }
}
