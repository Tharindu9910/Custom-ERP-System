import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { toBranchDate } from '@erp/shared';

export type DocumentKind =
  | 'JOB_CARD'
  | 'ROOFING_ORDER'
  | 'HARDWARE_SALE'
  | 'ORDER_LINE'
  | 'GATE_PASS'
  | 'STOCK_TRANSFER'
  | 'RECEIPT'
  | 'INVOICE';

const FORMATS: Record<DocumentKind, { seq: string; prefix: string; pad: number; yearly?: boolean }> = {
  JOB_CARD: { seq: 'job_card_number_seq', prefix: 'JC', pad: 5 },
  ROOFING_ORDER: { seq: 'roofing_order_number_seq', prefix: 'WO-FORM', pad: 5 },
  HARDWARE_SALE: { seq: 'hardware_sale_number_seq', prefix: 'HS', pad: 5 },
  ORDER_LINE: { seq: 'order_line_number_seq', prefix: 'WO', pad: 5 },
  GATE_PASS: { seq: 'gate_pass_number_seq', prefix: 'GP', pad: 5 },
  STOCK_TRANSFER: { seq: 'stock_transfer_number_seq', prefix: 'GI', pad: 4, yearly: true },
  RECEIPT: { seq: 'receipt_number_seq', prefix: 'RC', pad: 5 },
  INVOICE: { seq: 'invoice_number_seq', prefix: 'INV', pad: 5 },
};

/**
 * Document numbers from Postgres sequences — unique under concurrency and never
 * reused. A branch may override the prefix via settings.number_prefixes.
 */
@Injectable()
export class NumberService {
  async next(em: EntityManager, kind: DocumentKind, prefixOverrides: Record<string, string> = {}): Promise<string> {
    const f = FORMATS[kind];
    const rows: { n: string }[] = await em.query(`SELECT nextval('${f.seq}') AS n`);
    const n = String(rows[0].n).padStart(f.pad, '0');
    const prefix = prefixOverrides[kind] ?? f.prefix;
    return f.yearly ? `${prefix}-${toBranchDate().slice(0, 4)}-${n}` : `${prefix}-${n}`;
  }
}
