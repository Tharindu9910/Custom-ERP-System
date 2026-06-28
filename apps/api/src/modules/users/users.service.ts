import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@erp/shared';
import { ERR } from '../../common/errors';
import { UsersRepository } from './users.repository';

export interface SafeUser {
  user_id: string;
  branch_id: string | null;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
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

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

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

    const { password_hash: _, ...safeUser } = user;
    return safeUser;
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

  async createUser(dto: CreateUserDto, actorId: string): Promise<SafeUser> {
    const existing = await this.usersRepository.findByUsername(dto.username);
    if (existing) throw new ConflictException(ERR.USER_USERNAME_EXISTS);

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.usersRepository.save({
      username: dto.username,
      password_hash,
      full_name: dto.full_name,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      branch_id: dto.branch_id ?? null,
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
    if (dto.email !== undefined) user.email = dto.email ?? null;
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
  ): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) throw new NotFoundException(ERR.USER_NOT_FOUND);

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
