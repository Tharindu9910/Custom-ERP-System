// Mirrors the Postgres enums in the baseline migration (ER-v6 ORDER family).

export enum OrderType {
  JOB_CARD = 'JOB_CARD',
  ROOFING_ORDER = 'ROOFING_ORDER',
  HARDWARE_SALE = 'HARDWARE_SALE',
}

export enum SectionType {
  WORKSHOP = 'WORKSHOP',
  HARDWARE = 'HARDWARE',
  ROOFING = 'ROOFING',
}

export enum ServiceType {
  FABRICATION = 'FABRICATION',
  BUY_MATERIALS = 'BUY_MATERIALS',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  IN_QUEUE = 'IN_QUEUE',
  IN_PROGRESS = 'IN_PROGRESS',
  /** Job cards only: the supervisor marked the work done (Docs/decisions/0005) */
  COMPLETED = 'COMPLETED',
  CANCELLATION_PENDING = 'CANCELLATION_PENDING',
  CLOSED = 'CLOSED',
  VOIDED = 'VOIDED',
}

export enum DeliveryMethod {
  PICKUP = 'PICKUP',
  DELIVERY = 'DELIVERY',
}

export enum LineType {
  CUT_BEND = 'CUT_BEND',
  ROLLING = 'ROLLING',
  COIL_CUTTING = 'COIL_CUTTING',
  ROOFING_SHEET = 'ROOFING_SHEET',
  ROOFING_ACCESSORY = 'ROOFING_ACCESSORY',
  HARDWARE = 'HARDWARE',
  MATERIAL = 'MATERIAL',
}

export enum LineSubType {
  CUT = 'CUT',
  BEND = 'BEND',
  PIPE_BEND = 'PIPE_BEND',
  BOX_BAR_BEND = 'BOX_BAR_BEND',
  FLAT_IRON = 'FLAT_IRON',
  L_ANGLE = 'L_ANGLE',
  SHEET_ROLL = 'SHEET_ROLL',
  COIL_CUT = 'COIL_CUT',
}

export enum LineStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum MaterialSource {
  BRANCH = 'BRANCH',
  CUSTOMER = 'CUSTOMER',
}

export enum PriceBasis {
  PER_CUT = 'PER_CUT',
  PER_BEND = 'PER_BEND',
  PER_PIECE = 'PER_PIECE',
  PER_FT = 'PER_FT',
  PER_KG = 'PER_KG',
  PER_CUT_PER_M = 'PER_CUT_PER_M',
  FIXED = 'FIXED',
}

export enum HistoryEventType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  NOTE = 'NOTE',
  INSPECTION = 'INSPECTION',
}

export enum InspectionResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
}
