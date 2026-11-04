// Mirrors the Postgres enums in the baseline migration (ER-v6 INVENTORY and
// CUSTOMER MATERIAL families).

export enum ItemType {
  HARDWARE = 'HARDWARE',
  COIL = 'COIL',
  MATERIAL = 'MATERIAL',
}

/** A new catalogue product asked for by a branch (Docs/decisions/0013). */
export enum ItemRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum MovementType {
  SALE = 'SALE',
  JOB_USAGE = 'JOB_USAGE',
  JOB_REVERSAL = 'JOB_REVERSAL',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_RETURN = 'TRANSFER_RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
  OVERRIDE = 'OVERRIDE',
  LEGACY_OPENING = 'LEGACY_OPENING',
  /** Sent but never arrived; booked when the receiving branch's manager approves the loss */
  TRANSIT_SHORTAGE = 'TRANSIT_SHORTAGE',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
}

export enum TransferStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  ISSUED = 'ISSUED',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  /** Received short: the counted stock is in, the missing part waits for the manager (Docs/decisions/0014) */
  SHORTAGE_PENDING = 'SHORTAGE_PENDING',
}

/** Why a transfer arrived short (Docs/decisions/0014). */
export enum ShortageReason {
  DAMAGED = 'DAMAGED',
  MISSING = 'MISSING',
  SENDER_MISCOUNT = 'SENDER_MISCOUNT',
  OTHER = 'OTHER',
}

export const SHORTAGE_REASON_LABEL: Record<ShortageReason, string> = {
  [ShortageReason.DAMAGED]: 'Damaged in transit',
  [ShortageReason.MISSING]: 'Missing on arrival',
  [ShortageReason.SENDER_MISCOUNT]: 'Sender loaded fewer',
  [ShortageReason.OTHER]: 'Other',
};

export enum GatePassStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum LengthUnit {
  FT = 'FT',
  INCHES = 'INCHES',
}

export enum AllocationStatus {
  RESERVED = 'RESERVED',
  COMMITTED = 'COMMITTED',
  RELEASED = 'RELEASED',
}

// Branch material held for an order line from job creation until work starts (Docs/decisions/0003).
export enum ReservationStatus {
  RESERVED = 'RESERVED',
  CONSUMED = 'CONSUMED',
  RELEASED = 'RELEASED',
}

export enum NotificationChannel {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
}

export enum NotificationStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  FAILED = 'FAILED',
}
