import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ERR, ErrPayload } from './errors';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();

      if (
        typeof payload === 'object' &&
        payload !== null &&
        'code' in payload
      ) {
        const err = payload as ErrPayload;
        code = err.code;
        message = err.message;
        details = err.details;
      } else if (typeof payload === 'string') {
        message = payload;
      }
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        code = ERR.RATE_LIMIT_EXCEEDED.code;
        message = ERR.RATE_LIMIT_EXCEEDED.message;
      }
    }

    // details lets the UI act on the error (e.g. available qty, override allowed)
    const body: Record<string, unknown> = {
      error: details === undefined ? { code, message } : { code, message, details },
    };

    // if (process.env.NODE_ENV === 'development' && exception instanceof Error) {
    //   body.error = { ...(body.error as object), stack: exception.stack }
    // }

    response.status(status).json(body);

    if (status >= 500) {
      console.error(`[${request.method}] ${request.url}`, exception);
    }
  }
}
