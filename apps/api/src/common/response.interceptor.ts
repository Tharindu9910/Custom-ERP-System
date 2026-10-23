import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Server-sent event streams emit MessageEvents as they are
    if (Reflect.getMetadata(SSE_METADATA, ctx.getHandler())) return next.handle();
    // Files (attachments) are sent as they are, not wrapped
    return next.handle().pipe(map((data) => (data instanceof StreamableFile ? data : { data })));
  }
}
