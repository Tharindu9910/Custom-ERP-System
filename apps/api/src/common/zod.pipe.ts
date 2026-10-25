import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ERR, errWith } from './errors';

/**
 * Validates a body/query against a shared Zod schema and returns the parsed value
 * (defaults applied). Usage: `@Body(new ZodPipe(CreateGatePassSchema)) dto: CreateGatePassDto`.
 */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new BadRequestException(errWith(ERR.VALIDATION_FAILED, { issues }, issues[0]?.message ?? ERR.VALIDATION_FAILED.message));
  }
}
