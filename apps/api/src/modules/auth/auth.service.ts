import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Request } from 'express'
import { LessThan, Repository } from 'typeorm'
import { Role } from '@erp/shared'
import { ERR } from '../../common/errors'
import { UserRoleEntity } from '../../database/entities/user-role.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { UsersRepository } from '../users/users.repository'
import { UsersService } from '../users/users.service'

const CROSS_BRANCH_ROLES: Role[] = [Role.SUPER_ADMIN, Role.MANAGER]

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly usersService: UsersService,
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(UserSessionEntity)
    private readonly sessionRepo: Repository<UserSessionEntity>,
  ) {}

  async login(username: string, password: string, req: Request) {
    const user = await this.usersService.validateCredentials(username, password)
    const roleRow = await this.getActiveRole(user.user_id)
    const tokens = await this.createSession(user.user_id, roleRow, req)
    await this.usersRepository.updateLastLogin(user.user_id)
    return tokens
  }

  async refresh(userId: string, jti: string, req: Request) {
    const session = await this.sessionRepo.findOne({ where: { jti } })

    if (!session || !session.is_active) {
      // Stale or replayed refresh token — revoke ALL sessions for this user
      // (indicates token theft; force re-login on all devices)
      if (session) {
        this.logger.warn(`Refresh token replay detected for user ${userId} — revoking all sessions`)
        await this.revokeAllSessions(userId)
      }
      throw new UnauthorizedException(ERR.AUTH_REFRESH_TOKEN_INVALID)
    }

    if (session.expires_at < new Date()) {
      await this.revokeSession(session)
      throw new UnauthorizedException(ERR.AUTH_REFRESH_TOKEN_INVALID)
    }

    const user = await this.usersService.findById(userId)
    if (!user.is_active) {
      await this.revokeSession(session)
      throw new UnauthorizedException(ERR.AUTH_USER_INACTIVE)
    }

    // Rotate — revoke old session, create a new one
    await this.revokeSession(session)
    const roleRow = await this.getActiveRole(userId)
    return this.createSession(userId, roleRow, req)
  }

  async logout(jti: string): Promise<{ success: true }> {
    const session = await this.sessionRepo.findOne({ where: { jti } })
    if (session) {
      await this.revokeSession(session)
    }
    return { success: true }
  }

  async logoutAll(userId: string): Promise<{ success: true; revoked: number }> {
    const result = await this.revokeAllSessions(userId)
    return { success: true, revoked: result }
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId)
    const roleRow = await this.getActiveRole(userId)

    return {
      user_id: user.user_id,
      full_name: user.full_name,
      username: user.username,
      phone: user.phone,
      role: roleRow.role,
      branch_id: roleRow.branch_id,
      last_login_at: user.last_login_at,
    }
  }

  async validateSession(jti: string): Promise<boolean> {
    const session = await this.sessionRepo.findOne({
      where: { jti, is_active: true },
    })
    if (!session) return false
    if (session.expires_at < new Date()) {
      await this.revokeSession(session)
      return false
    }
    return true
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async createSession(
    userId: string,
    roleRow: UserRoleEntity,
    req: Request,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jti = crypto.randomUUID()
    const isCrossBranch = CROSS_BRANCH_ROLES.includes(roleRow.role)
    const user = await this.usersService.findById(userId)

    const refreshExpiresInMs = this.parseExpiry(
      this.config.get('JWT_REFRESH_EXPIRES', '7d'),
    )

    const session = this.sessionRepo.create({
      user_id: userId,
      jti,
      ip_address: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
      expires_at: new Date(Date.now() + refreshExpiresInMs),
    })
    await this.sessionRepo.save(session)

    const accessPayload = {
      sub: userId,
      jti,
      username: user.username,
      role: roleRow.role,
      branch_id: isCrossBranch ? null : roleRow.branch_id,
    }

    const refreshPayload = { sub: userId, jti }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.getOrThrow('JWT_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES', '15m'),
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES', '7d'),
      }),
    ])

    return { accessToken, refreshToken }
  }

  private async revokeSession(session: UserSessionEntity): Promise<void> {
    session.is_active = false
    session.revoked_at = new Date()
    await this.sessionRepo.save(session)
  }

  private async revokeAllSessions(userId: string): Promise<number> {
    const active = await this.sessionRepo.find({
      where: { user_id: userId, is_active: true },
    })
    if (active.length === 0) return 0
    const now = new Date()
    for (const s of active) {
      s.is_active = false
      s.revoked_at = now
    }
    await this.sessionRepo.save(active)
    return active.length
  }

  private async getActiveRole(userId: string): Promise<UserRoleEntity> {
    const roleRow = await this.userRoleRepo.findOne({
      where: { user_id: userId, is_active: true },
    })
    if (!roleRow) throw new UnauthorizedException(ERR.AUTH_INSUFFICIENT_PERMISSION)
    return roleRow
  }

  private parseExpiry(expiry: string): number {
    const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
    const match = expiry.match(/^(\d+)([smhd])$/)
    if (!match) return 7 * 86_400_000
    return parseInt(match[1]) * units[match[2]]
  }
}
