import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Role, isGlobalRole, type ChangePasswordDto, type CreateChiefDto } from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR } from '../../common/errors';
import { UsersRepository } from './users.repository';

export interface SafeUser {
  user_id: string;
  employee_id: string | null;
  branch_id: string | null;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  must_change_password: boolean;
  password_changed_at: Date | null;
  temp_password_expires_at: Date | null;
  failed_login_count: number;
  locked_until: Date | null;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  last_login_at: Date | null;
}
export type UserWithRole = SafeUser & { role: Role | null };

export class CreateUserDto {
  username: string;
  password: string;
  full_name: string;
  email?: string;
  phone?: string;
  branch_id?: string;
  role: Role;
}

export class UpdateUserDto {
  full_name?: string;
  email?: string;
  phone?: string;
  is_active?: boolean;
}

export class AssignRoleDto {
  role: Role;
  branch_id?: string;
}

const BCRYPT_ROUNDS = 10;

/** Temporary passwords stop working after this many hours (ER-v6 temp_password_expires_at). */
export const TEMP_PASSWORD_HOURS = 72;

/** 10 characters with upper, lower and digits; no look-alike characters. */
function generateTempPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789'];
  const all = sets.join('');
  const chars = sets.map((set) => set[randomInt(set.length)]);
  while (chars.length < 10) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// Global roles have no branch; every other role needs one (mirrors chk_user_role_branch_scope)
function assertRoleBranchScope(role: Role, branchId?: string | null): void {
  if (isGlobalRole(role) && branchId) throw new BadRequestException(ERR.USER_ROLE_BRANCH_FORBIDDEN);
  if (!isGlobalRole(role) && !branchId) throw new BadRequestException(ERR.USER_ROLE_BRANCH_REQUIRED);
}

// Only a super admin can make another super admin (ADMIN also has manage:users)
function assertCanGrant(role: Role, actorRole: Role): void {
  if (role === Role.SUPER_ADMIN && actorRole !== Role.SUPER_ADMIN) {
    throw new ForbiddenException(ERR.AUTH_INSUFFICIENT_PERMISSION);
  }
}

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async validateCredentials(
    username: string,
    password: string,
  ): Promise<SafeUser> {
    const user = await this.usersRepository.findByUsername(username);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException(ERR.AUTH_INVALID_CREDENTIALS);
    }

    if (!user.is_active) {
      throw new UnauthorizedException(ERR.AUTH_USER_INACTIVE);
    }

    if (user.must_change_password && user.temp_password_expires_at && user.temp_password_expires_at < new Date()) {
      throw new UnauthorizedException(ERR.AUTH_TEMP_PASSWORD_EXPIRED);
    }

    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) throw new NotFoundException(ERR.USER_NOT_FOUND);
    if (!(await bcrypt.compare(dto.current_password, user.password_hash))) {
      throw new BadRequestException(ERR.AUTH_CURRENT_PASSWORD_WRONG);
    }
    user.password_hash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);
    user.must_change_password = false;
    user.temp_password_expires_at = null;
    user.password_changed_at = new Date();
    await this.usersRepository.save(user);
  }

  /** Branch employees who don't have a login yet (Create Chief Profile). */
  chiefCandidates(branchId: string, search?: string) {
    return this.ds.query(
      `SELECT e.employee_id, e.employee_code, e.full_name, e.designation, e.phone
       FROM employee e
       WHERE e.branch_id = $1 AND e.is_active = true
         AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.employee_id = e.employee_id)
         AND ($2::text IS NULL OR e.full_name ILIKE '%' || $2 || '%' OR e.employee_code ILIKE '%' || $2 || '%')
       ORDER BY e.full_name`,
      [branchId, search?.trim() || null],
    );
  }

  /**
   * A supervisor turns a branch employee into a CHIEF login. The email is the
   * username; a temporary password is returned once and must be changed at first
   * login (expires after 72h).
   */
  async createChief(dto: CreateChiefDto, actor: Actor) {
    const temporaryPassword = generateTempPassword();
    const expiresAt = new Date(Date.now() + TEMP_PASSWORD_HOURS * 3_600_000);
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    const user = await this.ds.transaction(async (em) => {
      const employees: { full_name: string; phone: string | null }[] = await em.query(
        `SELECT full_name, phone FROM employee WHERE employee_id = $1 AND branch_id = $2 AND is_active = true FOR UPDATE`,
        [dto.employee_id, actor.branch_id],
      );
      if (!employees[0]) throw new NotFoundException(ERR.WORKER_NOT_FOUND);
      const taken: { username: string; email: string | null; employee_id: string | null }[] = await em.query(
        `SELECT username, email, employee_id FROM "user" WHERE employee_id = $1 OR lower(username) = $2 OR lower(email) = $2`,
        [dto.employee_id, dto.email],
      );
      if (taken.some((t) => t.employee_id === dto.employee_id)) throw new ConflictException(ERR.EMPLOYEE_HAS_ACCOUNT);
      if (taken.length > 0) throw new ConflictException(ERR.USER_EMAIL_EXISTS);

      const [row]: { user_id: string }[] = await em.query(
        `INSERT INTO "user" (employee_id, branch_id, full_name, username, email, phone, password_hash,
                             must_change_password, temp_password_expires_at, created_by)
         VALUES ($1, $2, $3, $4, $4, $5, $6, true, $7, $8) RETURNING user_id`,
        [dto.employee_id, actor.branch_id, employees[0].full_name, dto.email, employees[0].phone, passwordHash, expiresAt, actor.user_id],
      );
      await em.query(
        `INSERT INTO user_role (user_id, branch_id, role, is_active, assigned_by) VALUES ($1, $2, 'CHIEF', true, $3)`,
        [row.user_id, actor.branch_id, actor.user_id],
      );
      return { user_id: row.user_id, full_name: employees[0].full_name };
    });

    return {
      user_id: user.user_id,
      full_name: user.full_name,
      username: dto.email,
      role: Role.CHIEF,
      temporary_password: temporaryPassword,
      expires_at: expiresAt.toISOString(),
    };
  }

  async findById(id: string): Promise<SafeUser> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new UnauthorizedException(ERR.AUTH_INVALID_CREDENTIALS);
    }
    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  async listUsers(actorBranchId: string | null): Promise<UserWithRole[]> {
    const users = await this.usersRepository.findAllByBranch(actorBranchId);
    return users.map(({ password_hash: _, roles, ...u }) => ({
      ...u,
      role: roles?.find((r) => r.is_active)?.role ?? null,
    }));
  }

  async createUser(dto: CreateUserDto, actorId: string, actorRole: Role): Promise<SafeUser> {
    const existing = await this.usersRepository.findByUsername(dto.username);
    if (existing) throw new ConflictException(ERR.USER_USERNAME_EXISTS);
    // Blank email/phone are "not given"; an email must not belong to another user
    const email = dto.email?.trim() || null;
    if (email && (await this.usersRepository.findByEmail(email))) throw new ConflictException(ERR.USER_EMAIL_EXISTS);
    assertCanGrant(dto.role, actorRole);
    assertRoleBranchScope(dto.role, dto.branch_id);

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.usersRepository.save({
      username: dto.username,
      password_hash,
      full_name: dto.full_name,
      email,
      phone: dto.phone?.trim() || null,
      branch_id: dto.branch_id ?? null,
      created_by: actorId,
    });

    await this.usersRepository.saveRole({
      user_id: user.user_id,
      branch_id: dto.branch_id ?? null,
      role: dto.role,
      assigned_by: actorId,
      is_active: true,
    });

    const { password_hash: _, ...safeUser } = user;
    return safeUser;
  }

  async updateUser(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<SafeUser> {
    const user = await this.usersRepository.findById(userId);
    if (!user) throw new NotFoundException(ERR.USER_NOT_FOUND);

    if (dto.full_name !== undefined) user.full_name = dto.full_name;
    if (dto.email !== undefined) user.email = dto.email?.trim() || null;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;
    if (dto.is_active !== undefined) user.is_active = dto.is_active;

    const saved = await this.usersRepository.save(user);

    if (dto.is_active === false) {
      await this.usersRepository.revokeUserSessions(userId);
    }

    const { password_hash: _, ...safeUser } = saved;
    return safeUser;
  }

  async assignRole(
    userId: string,
    dto: AssignRoleDto,
    actorId: string,
    actorRole: Role,
  ): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) throw new NotFoundException(ERR.USER_NOT_FOUND);
    assertCanGrant(dto.role, actorRole);
    assertRoleBranchScope(dto.role, dto.branch_id);

    // Deactivate any existing active role before assigning new one
    await this.usersRepository.deactivateActiveRole(userId);

    await this.usersRepository.saveRole({
      user_id: userId,
      branch_id: dto.branch_id ?? null,
      role: dto.role,
      assigned_by: actorId,
      is_active: true,
    });

    // Keep user.branch_id in sync with the new role's branch
    user.branch_id = dto.branch_id ?? null;
    await this.usersRepository.save(user);
  }
}
