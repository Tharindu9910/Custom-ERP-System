import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ERR, ErrPayload } from './errors';

/** Postgres SQLSTATEs that mean a bad or conflicting request, not a server fault. */
const PG_ERRORS: Record<string, { status: HttpStatus; err: { code: string; message: string } }> = {
  '23505': { status: HttpStatus.CONFLICT, err: ERR.DUPLICATE }, // unique_violation (e.g. a race past a pre-check)
  '22P02': { status: HttpStatus.BAD_REQUEST, err: ERR.VALIDATION_FAILED }, // invalid_text_representation (bad uuid)
  '22003': { status: HttpStatus.BAD_REQUEST, err: ERR.VALIDATION_FAILED }, // numeric_value_out_of_range
  '22007': { status: HttpStatus.BAD_REQUEST, err: ERR.VALIDATION_FAILED }, // invalid_datetime_format
  '22008': { status: HttpStatus.BAD_REQUEST, err: ERR.VALIDATION_FAILED }, // datetime_field_overflow (e.g. 2026-02-31)
  '23502': { status: HttpStatus.BAD_REQUEST, err: ERR.VALIDATION_FAILED }, // not_null_violation
  '23514': { status: HttpStatus.BAD_REQUEST, err: ERR.VALIDATION_FAILED }, // check_violation
  '40001': { status: HttpStatus.CONFLICT, err: ERR.TRY_AGAIN }, // serialization_failure: retrying is safe
  '40P01': { status: HttpStatus.CONFLICT, err: ERR.TRY_AGAIN }, // deadlock_detected: retrying is safe
};

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
      } else {
        // Uncoded HttpException (e.g. BadRequestException('…'), a multer 413): keep its status and text, add a code
        const text = typeof payload === 'string' ? payload : (payload as { message?: unknown })?.message;
        if (typeof text === 'string') message = text;
        else if (Array.isArray(text) && typeof text[0] === 'string') message = text[0];
        code = status === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL_ERROR' : ERR.BAD_REQUEST.code;
      }
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        code = ERR.RATE_LIMIT_EXCEEDED.code;
        message = ERR.RATE_LIMIT_EXCEEDED.message;
      }
    } else if (exception instanceof QueryFailedError) {
      // Postgres errors the client caused; anything else stays a 500
      const pgCode = (exception.driverError as { code?: string } | undefined)?.code;
      const mapped = PG_ERRORS[pgCode ?? ''];
      if (mapped) {
        status = mapped.status;
        code = mapped.err.code;
        message = mapped.err.message;
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
