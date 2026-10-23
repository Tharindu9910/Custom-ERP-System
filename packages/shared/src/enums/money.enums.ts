// Mirrors the Postgres enums in the baseline migration (ER-v6 MONEY family).

export enum PaymentKind {
  ADVANCE = 'ADVANCE',
  PARTIAL = 'PARTIAL',
  FINAL = 'FINAL',
  REVERSAL = 'REVERSAL',
}

export enum PaymentStatus {
  COMPLETED = 'COMPLETED',
  REVERSED = 'REVERSED',
}

export enum InvoiceType {
  ADVANCE = 'ADVANCE',
  FINAL = 'FINAL',
  TAX = 'TAX',
}

export enum PettyCashStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  RELEASED = 'RELEASED',
  SETTLED = 'SETTLED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum ApprovalType {
  PETTY_CASH = 'PETTY_CASH',
  DISCOUNT_OVERRIDE = 'DISCOUNT_OVERRIDE',
  ORDER_CANCELLATION = 'ORDER_CANCELLATION',
  LINE_CANCELLATION = 'LINE_CANCELLATION',
  STOCK_TRANSFER = 'STOCK_TRANSFER',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum PayrollStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
}
