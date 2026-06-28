import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { UserRoleEntity } from '../../database/entities/user-role.entity';
import { UserSessionEntity } from '../../database/entities/user-session.entity';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly roleRepo: Repository<UserRoleEntity>,
    @InjectRepository(UserSessionEntity)
    private readonly sessionRepo: Repository<UserSessionEntity>,
  ) {}

  findByUsername(username: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { username } });
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { email } });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { user_id: id } });
  }

  findAllByBranch(branchId: string | null): Promise<UserEntity[]> {
    if (branchId === null) {
      return this.repo.find({ relations: { roles: true }, order: { created_at: 'ASC' } });
    }
    return this.repo.find({
      where: { branch_id: branchId },
      relations: { roles: true },
      order: { created_at: 'ASC' },
    });
  }

  save(user: Partial<UserEntity>): Promise<UserEntity> {
    return this.repo.save(user as UserEntity);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.repo.update({ user_id: userId }, { last_login_at: new Date() });
  }

  findActiveRole(userId: string): Promise<UserRoleEntity | null> {
    return this.roleRepo.findOne({ where: { user_id: userId, is_active: true } });
  }

  async deactivateActiveRole(userId: string): Promise<void> {
    await this.roleRepo.update(
      { user_id: userId, is_active: true },
      { is_active: false },
    );
  }

  saveRole(role: Partial<UserRoleEntity>): Promise<UserRoleEntity> {
    return this.roleRepo.save(role as UserRoleEntity);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const now = new Date();
    await this.sessionRepo.update(
      { user_id: userId, is_active: true },
      { is_active: false, revoked_at: now },
    );
  }
}
