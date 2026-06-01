import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Throttle } from '@nestjs/throttler'
import { CurrentUser, Public } from '../../common/decorators'
import { RequestUser } from '../../common/types'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // THROTTLE_AUTH_LIMIT (default 10) requests per minute per IP
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto.username, dto.password, req)
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@CurrentUser() user: { user_id: string; jti: string }, @Req() req: any) {
    return this.authService.refresh(user.user_id, user.jti, req)
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: RequestUser) {
    return this.authService.logout(user.jti)
  }

  @Post('logout/all')
  @HttpCode(HttpStatus.OK)
  logoutAll(@CurrentUser() user: RequestUser) {
    return this.authService.logoutAll(user.user_id)
  }

  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return this.authService.getMe(user.user_id)
  }
}