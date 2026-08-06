import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  HttpCode,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { parseDuration } from './util/parse-duration';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtPayload } from './types/jwt-payload.interface';
import { MeResponseDto } from './dto/me.dto';

const BASE_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  path: '/',
};

type CookieOpts = typeof BASE_COOKIE_OPTS & { secure: boolean };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieOpts: CookieOpts;
  private readonly accessCookieMaxAge: number;
  private readonly refreshCookieMaxAge: number;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieOpts = {
      ...BASE_COOKIE_OPTS,
      secure: config.get('NODE_ENV', { infer: true }) === 'production',
    };
    this.accessCookieMaxAge = parseDuration(
      config.getOrThrow('JWT_ACCESS_EXPIRY', { infer: true }),
    );
    this.refreshCookieMaxAge = parseDuration(
      config.getOrThrow('JWT_REFRESH_EXPIRY', { infer: true }),
    );
  }

  /**
   * Five attempts per minute per IP. Tight because this is the one
   * endpoint where an attacker gets unlimited free guesses, and
   * because a legitimate human never needs a sixth try in a minute.
   */
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto);
    this.setTokenCookies(res, tokens);
    return { message: 'Login successful' };
  }

  /**
   * Looser than login but still bounded. A refresh flood against a
   * rotating-token scheme is self-harming: each replay of an
   * already-spent token reads as theft and revokes the whole family.
   */
  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.refresh_token;
    if (!rawToken) throw new UnauthorizedException('No refresh token');

    const tokens = await this.auth.refresh(rawToken);
    this.setTokenCookies(res, tokens);
    return { message: 'Token refreshed' };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.refresh_token;
    if (rawToken) await this.auth.logout(rawToken);

    res.clearCookie('access_token', this.cookieOpts);
    res.clearCookie('refresh_token', this.cookieOpts);
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Profile of the logged-in user' })
  @ApiOkResponse({ type: MeResponseDto })
  me(@CurrentUser() user: JwtPayload): Promise<MeResponseDto> {
    return this.auth.me(user.sub);
  }

  private setTokenCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    res.cookie('access_token', tokens.accessToken, {
      ...this.cookieOpts,
      maxAge: this.accessCookieMaxAge,
    });
    res.cookie('refresh_token', tokens.refreshToken, {
      ...this.cookieOpts,
      maxAge: this.refreshCookieMaxAge,
    });
  }
}
