import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { UserRoleEntity } from '../../database/entities/user-role.entity';
import { UserSessionEntity } from '../../database/entities/user-session.entity';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserRoleEntity, UserSessionEntity])],
  providers: [UsersRepository, UsersService],
  controllers: [UsersController],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
