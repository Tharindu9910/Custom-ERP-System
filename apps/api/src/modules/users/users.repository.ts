import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {}

  findByUsername(username: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { username } });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { user_id: id } });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.repo.update({ user_id: userId }, { last_login_at: new Date() });
  }
}
