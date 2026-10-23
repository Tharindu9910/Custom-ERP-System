import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';

/** What changed — screens refetch the matching queries. */
export type LiveTopic = 'orders' | 'gate_passes' | 'stock' | 'transfers' | 'payments';

export interface BranchChangedEvent {
  branch_id: string;
  topic: LiveTopic;
}

interface Ticket {
  user_id: string;
  branch_id: string | null;
  expires_at: number;
}

const TICKET_TTL_MS = 30_000;
export const BRANCH_CHANGED = 'branch.changed';

/**
 * Small "something changed" nudges for live screens (instructions §4: push a tiny
 * message, let screens refetch). Emit only after the transaction has committed.
 */
@Injectable()
export class EventsService {
  private tickets = new Map<string, Ticket>();

  constructor(private readonly emitter: EventEmitter2) {}

  changed(branchId: string, ...topics: LiveTopic[]): void {
    for (const topic of topics) this.emitter.emit(BRANCH_CHANGED, { branch_id: branchId, topic } satisfies BranchChangedEvent);
  }

  issueTicket(userId: string, branchId: string | null): { ticket: string; expires_in: number } {
    this.sweep();
    const ticket = randomBytes(24).toString('base64url');
    this.tickets.set(ticket, { user_id: userId, branch_id: branchId, expires_at: Date.now() + TICKET_TTL_MS });
    return { ticket, expires_in: TICKET_TTL_MS / 1000 };
  }

  /** Single use: a ticket opens one stream and is then gone. */
  redeemTicket(ticket: string): Ticket | null {
    const t = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!t || t.expires_at < Date.now()) return null;
    return t;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, t] of this.tickets) if (t.expires_at < now) this.tickets.delete(k);
  }
}
