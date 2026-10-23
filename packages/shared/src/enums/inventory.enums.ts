// Mirrors the Postgres enums in the baseline migration (ER-v6 INVENTORY and
// CUSTOMER MATERIAL families).

export enum ItemType {
  HARDWARE = 'HARDWARE',
  COIL = 'COIL',
  MATERIAL = 'MATERIAL',
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
}

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
