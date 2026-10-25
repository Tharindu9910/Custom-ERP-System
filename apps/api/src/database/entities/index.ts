import { ApprovalRequestEntity } from './approval-request.entity';
import { AttachmentEntity } from './attachment.entity';
import { AuditLogEntity } from './audit-log.entity';
import { BranchStockEntity } from './branch-stock.entity';
import { BranchTypeDefaultEntity } from './branch-type-default.entity';
import { BranchEntity } from './branch.entity';
import { CustomerEntity } from './customer.entity';
import { EmployeeEntity } from './employee.entity';
import { FinancialAccountEntity } from './financial-account.entity';
import { GatePassItemEntity } from './gate-pass-item.entity';
import { GatePassEntity } from './gate-pass.entity';
import { InvoiceEntity } from './invoice.entity';
import { ItemEntity } from './item.entity';
import { LedgerEntryEntity } from './ledger-entry.entity';
import { LegacyImportEntity } from './legacy-import.entity';
import { LineAssignmentEntity } from './line-assignment.entity';
import { MaterialAllocationEntity } from './material-allocation.entity';
import { NotificationEntity } from './notification.entity';
import { OrderLineEntity } from './order-line.entity';
import { OrderEntity } from './order.entity';
import { PaymentEntity } from './payment.entity';
import { PayrollRunEntity } from './payroll-run.entity';
import { PayslipEntity } from './payslip.entity';
import { PermissionEntity } from './permission.entity';
import { PettyCashEntity } from './petty-cash.entity';
import { PriceRateEntity } from './price-rate.entity';
import { RolePermissionEntity } from './role-permission.entity';
import { StatusHistoryEntity } from './status-history.entity';
import { StockAlertEntity } from './stock-alert.entity';
import { StockMovementEntity } from './stock-movement.entity';
import { StockReservationEntity } from './stock-reservation.entity';
import { StockTransferLineEntity } from './stock-transfer-line.entity';
import { StockTransferEntity } from './stock-transfer.entity';
import { SyncConflictEntity } from './sync-conflict.entity';
import { UserRoleEntity } from './user-role.entity';
import { UserSessionEntity } from './user-session.entity';
import { UserEntity } from './user.entity';

// Every entity registered with TypeORM (app module and seed).
export const ALL_ENTITIES = [
  UserEntity,
  UserRoleEntity,
  UserSessionEntity,
  BranchEntity,
  BranchTypeDefaultEntity,
  PermissionEntity,
  RolePermissionEntity,
  EmployeeEntity,
  CustomerEntity,
  OrderEntity,
  OrderLineEntity,
  LineAssignmentEntity,
  StatusHistoryEntity,
  PriceRateEntity,
  PaymentEntity,
  InvoiceEntity,
  FinancialAccountEntity,
  LedgerEntryEntity,
  PettyCashEntity,
  ApprovalRequestEntity,
  PayrollRunEntity,
  PayslipEntity,
  GatePassEntity,
  GatePassItemEntity,
  MaterialAllocationEntity,
  ItemEntity,
  BranchStockEntity,
  StockMovementEntity,
  StockReservationEntity,
  StockAlertEntity,
  StockTransferEntity,
  StockTransferLineEntity,
  AttachmentEntity,
  NotificationEntity,
  SyncConflictEntity,
  LegacyImportEntity,
  AuditLogEntity,
];
