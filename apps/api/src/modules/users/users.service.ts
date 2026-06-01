import { Injectable, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { ERR } from '../../common/errors'
import { UserEntity } from '../../database/entities/user.entity'
import { UsersRepository } from './users.repository'

type SafeUser = Omit<UserEntity, 'password_hash'>

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async validateCredentials(username: string, password: string): Promise<SafeUser> {
    const user = await this.usersRepository.findByUsername(username)

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException(ERR.AUTH_INVALID_CREDENTIALS)
    }

    if (!user.is_active) {
      throw new UnauthorizedException(ERR.AUTH_USER_INACTIVE)
    }

    const { password_hash: _, ...safeUser } = user
    return safeUser
  }

  async findById(id: string): Promise<SafeUser> {
    const user = await this.usersRepository.findById(id)
    if (!user) {
      // Do not reveal whether the user exists
      throw new UnauthorizedException(ERR.AUTH_INVALID_CREDENTIALS)
    }
    const { password_hash: _, ...safeUser } = user
    return safeUser
  }
}
