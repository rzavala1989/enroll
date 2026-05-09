import {
    Body,
    Controller,
    Post,
    Res,
    HttpCode,
    UseGuards, Req, UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

const COOKIE_OPTS = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
};

@Controller('auth')
export class AuthController {
    constructor(private readonly auth: AuthService) {}

    @Post('login')
    @HttpCode(200)
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        const tokens = await this.auth.login(dto);
        this.setTokenCookies(res, tokens);
        return { message: 'Login successful' };
    }

    @Post('refresh')
    @HttpCode(200)
    async refresh(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const rawToken = req.cookies?.refresh_token;
        if (!rawToken) throw new UnauthorizedException('No refresh token');

        const tokens = await this.auth.refresh(rawToken);
        this.setTokenCookies(res, tokens);
        return { message: 'Token refreshed' };
    }

    @Post('logout')
    @HttpCode(200)
    async logout(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        const rawToken = req.cookies?.refresh_token;
        if (rawToken) await this.auth.logout(rawToken);

        res.clearCookie('access_token', COOKIE_OPTS);
        res.clearCookie('refresh_token', COOKIE_OPTS);
        return { message: 'Logged out' };
    }

    private setTokenCookies(
        res: Response,
        tokens: { accessToken: string; refreshToken: string },
    ) {
        res.cookie('access_token', tokens.accessToken, {
            ...COOKIE_OPTS,
            maxAge: 15 * 60 * 1000, // 15 minutes
        });
        res.cookie('refresh_token', tokens.refreshToken, {
            ...COOKIE_OPTS,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
    }
}
