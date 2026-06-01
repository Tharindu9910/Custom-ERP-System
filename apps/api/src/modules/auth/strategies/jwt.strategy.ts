import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ERR } from '../../../common/errors'
import { RequestUser } from '../../../common/types'
import { AuthService } from '../auth.service'

interface JwtPayload {
  sub: string
  jti: string
  username: string
  role: string
  branch_id: string | null
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    })
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const sessionActive = await this.authService.validateSession(payload.jti)
    if (!sessionActive) {
      throw new UnauthorizedException(ERR.AUTH_TOKEN_EXPIRED)
    }

    return {
      user_id: payload.sub,
      jti: payload.jti,
      username: payload.username,
      role: payload.role as RequestUser['role'],
      branch_id: payload.branch_id,
    }
  }
}