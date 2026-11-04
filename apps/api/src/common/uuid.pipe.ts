import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { ERR } from './errors';

/**
 * ParseUUIDPipe that throws our VAL_001 payload, so a bad id is a coded 400 rather
 * than Nest's bare message (or a Postgres 22P02 500). Usage: `@Param('id', UuidPipe)`.
 */
export const UuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException(ERR.VALIDATION_FAILED),
});
