import { Controller, Post, Query, Sse, UnauthorizedException, type MessageEvent } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromEvent, interval, map, merge, filter, type Observable } from 'rxjs';
import { CurrentUser, Public, ReadBranchId } from '../common/decorators';
import { ERR } from '../common/errors';
import type { RequestUser } from '../common/types';
import { BRANCH_CHANGED, EventsService, type BranchChangedEvent } from './events.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly emitter: EventEmitter2,
  ) {}

  /**
   * Exchange the access token (Bearer) for a short-lived stream ticket. Subscribing is
   * a read, so head office may use it too; with no branch (All branches) it streams every branch.
   */
  @Post('ticket')
  ticket(@CurrentUser() user: RequestUser, @ReadBranchId() branchId: string | null) {
    return this.events.issueTicket(user.user_id, branchId);
  }

  @Public()
  @Sse('stream')
  stream(@Query('ticket') ticket: string): Observable<MessageEvent> {
    const t = ticket ? this.events.redeemTicket(ticket) : null;
    if (!t) throw new UnauthorizedException(ERR.AUTH_SSE_TICKET_INVALID);

    const changes = fromEvent(this.emitter, BRANCH_CHANGED).pipe(
      map((e) => e as BranchChangedEvent),
      filter((e) => t.branch_id === null || e.branch_id === t.branch_id),
      map((e): MessageEvent => ({ type: 'changed', data: e })),
    );
    // Keeps proxies from closing an idle stream
    const heartbeat = interval(25_000).pipe(map((): MessageEvent => ({ type: 'ping', data: {} })));
    return merge(changes, heartbeat);
  }
}
