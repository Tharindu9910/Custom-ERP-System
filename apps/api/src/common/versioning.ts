import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ERR } from './errors';

/**
 * Optimistic lock: bumps `version` only if it still equals the version the client saw.
 * Throws 409 ORDER_VERSION_CONFLICT when someone else changed the row first.
 */
export async function bumpVersion(
  em: EntityManager,
  table: 'order' | 'order_line',
  idColumn: string,
  id: string,
  expectedVersion: number,
): Promise<number> {
  const rows: { version: number }[] = await em.query(
    `UPDATE "${table}" SET version = version + 1 WHERE ${idColumn} = $1 AND version = $2 RETURNING version`,
    [id, expectedVersion],
  );
  // TypeORM returns [rows, count] for UPDATE ... RETURNING on postgres
  const result = Array.isArray(rows[0]) ? (rows[0] as unknown as { version: number }[]) : rows;
  if (result.length === 0) throw new ConflictException(ERR.ORDER_VERSION_CONFLICT);
  return result[0].version;
}
