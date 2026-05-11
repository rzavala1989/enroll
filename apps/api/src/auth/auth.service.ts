import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { LoginDto } from './dto/login.dto';

// ── Types ─────────────────────────────────────────────
interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

// Parses durations like "7d", "15m", "30s", "100ms" into milliseconds.
function parseDuration(value: string): number {
    const match = value.trim().match(/^(\d+)(ms|s|m|h|d)$/);
    if (!match) throw new Error(`Invalid duration: ${value}`);
    const n = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
        ms: 1,
        s: 1000,
        m: 60_000,
        h: 3_600_000,
        d: 86_400_000,
    };
    return n * multipliers[unit];
}

@Injectable()
export class AuthService {
    private readonly refreshExpiryMs: number;

    constructor(
        private readonly jwt: JwtService,
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) {
        this.refreshExpiryMs = parseDuration(
            this.config.getOrThrow<string>('JWT_REFRESH_EXPIRY'),
        );
    }

    // ── Login ───────────────────────────────────────────
    async login(dto: LoginDto): Promise<TokenPair> {
        const { email, password } = dto;
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) throw new UnauthorizedException('Invalid credentials');

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

        return this.generateTokenPair(user.id, user.roles, uuidv4());
    }

    // ── Refresh ─────────────────────────────────────────
    async refresh(rawRefreshToken: string): Promise<TokenPair> {
        const tokenHash = this.hashToken(rawRefreshToken);

        const stored = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: { select: { id: true, roles: true } } },
        });

        // Token doesn't exist at all
        if (!stored) throw new UnauthorizedException('Invalid refresh token');

        // REUSE DETECTION: token was already revoked, someone replayed it
        if (stored.revokedAt) {
            await this.revokeFamily(stored.family);
            throw new UnauthorizedException('Token reuse detected');
        }

        // Token expired naturally
        if (stored.expiresAt < new Date()) {
            throw new UnauthorizedException('Refresh token expired');
        }

        // Rotate: issue new pair in the same family
        const newPair = await this.generateTokenPair(
            stored.user.id,
            stored.user.roles,
            stored.family,
        );

        // Revoke the old token, link it to its replacement
        const newTokenHash = this.hashToken(newPair.refreshToken);
        const replacement = await this.prisma.refreshToken.findUnique({
            where: { tokenHash: newTokenHash },
            select: { id: true },
        });

        await this.prisma.refreshToken.update({
            where: { id: stored.id },
            data: {
                revokedAt: new Date(),
                replacedById: replacement?.id ?? null,
            },
        });

        return newPair;
    }

    // ── Logout ──────────────────────────────────────────
    async logout(rawRefreshToken: string): Promise<void> {
        const tokenHash = this.hashToken(rawRefreshToken);

        await this.prisma.refreshToken.updateMany({
            where: { tokenHash, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    // ── Private helpers ─────────────────────────────────

    private async generateTokenPair(
        userId: string,
        roles: string[],
        family: string,
    ): Promise<TokenPair> {
        const jti = uuidv4();
        const accessToken = await this.jwt.signAsync({ sub: userId, roles, jti });

        const rawRefreshToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawRefreshToken);

        await this.prisma.refreshToken.create({
            data: {
                userId,
                tokenHash,
                family,
                expiresAt: this.refreshExpiryDate(),
            },
        });

        return { accessToken, refreshToken: rawRefreshToken };
    }

    private hashToken(raw: string): string {
        return createHash('sha256').update(raw).digest('hex');
    }

    private refreshExpiryDate(): Date {
        return new Date(Date.now() + this.refreshExpiryMs);
    }

    private async revokeFamily(family: string): Promise<void> {
        await this.prisma.refreshToken.updateMany({
            where: { family, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }
}
