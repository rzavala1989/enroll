import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnrollmentStatus } from '@prisma/client';
import type { StudentProfile } from '@enroll/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { LoginDto } from './dto/login.dto';
import { MeResponseDto } from './dto/me.dto';
import { parseDuration } from './util/parse-duration';

// ── Types ─────────────────────────────────────────────
interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * A real bcrypt hash of a value nobody can supply, compared against on
 * the account-not-found path.
 *
 * Without it, a miss returns as soon as the user lookup fails while a
 * hit pays ~100ms of bcrypt, and the response time tells an attacker
 * which email addresses have accounts. Cost 10 matches what the seed
 * and registration use, so both paths burn the same work.
 */
const DUMMY_PASSWORD_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class AuthService {
  private readonly refreshExpiryMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.refreshExpiryMs = parseDuration(
      this.config.getOrThrow('JWT_REFRESH_EXPIRY', { infer: true }),
    );
  }

  // ── Login ───────────────────────────────────────────
  async login(dto: LoginDto): Promise<TokenPair> {
    const { email, password } = dto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always compare, so the response time of an unknown email
    // matches that of a known one with the wrong password.
    const passwordValid = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

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

  // ── Me ──────────────────────────────────────────────
  async me(userId: string): Promise<MeResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roles: true,
        classStanding: true,
        advisor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    return {
      ...user,
      classStanding: user.classStanding ?? null,
      advisor: user.advisor ?? null,
    };
  }

  async profile(userId: string): Promise<StudentProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        classStanding: true,
        advisor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!user) throw new UnauthorizedException();

    // Active holds on this student.
    const holds = await this.prisma.advisorHold.findMany({
      where: { studentId: userId, releasedAt: null },
      select: {
        id: true,
        reason: true,
        createdAt: true,
        advisor: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Current (most recent open) term.
    const now = new Date();
    const term = await this.prisma.term.findFirst({
      where: { registrationCloses: { gte: now } },
      orderBy: { startDate: 'asc' },
      select: { id: true, season: true, year: true, maxCredits: true },
    });

    let currentTerm: StudentProfile['currentTerm'] = null;
    if (term) {
      const activeEnrollments = await this.prisma.enrollment.findMany({
        where: {
          studentId: userId,
          status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED] },
          section: { termId: term.id },
        },
        select: {
          status: true,
          section: { select: { course: { select: { credits: true } } } },
        },
      });

      const enrolled = activeEnrollments.filter(
        (e) => e.status === EnrollmentStatus.ENROLLED,
      );
      const waitlisted = activeEnrollments.filter(
        (e) => e.status === EnrollmentStatus.WAITLISTED,
      );

      const overload = await this.prisma.overloadApproval.findUnique({
        where: { studentId_termId: { studentId: userId, termId: term.id } },
        select: { maxCredits: true },
      });

      currentTerm = {
        id: term.id,
        name: `${term.season.charAt(0)}${term.season.slice(1).toLowerCase()} ${term.year}`,
        enrolledCredits: enrolled.reduce((sum, e) => sum + e.section.course.credits, 0),
        enrolledCourses: enrolled.length,
        waitlistedCourses: waitlisted.length,
        maxCredits: term.maxCredits,
        overloadMaxCredits: overload?.maxCredits ?? null,
      };
    }

    // Total completed credits across all terms.
    const completedRows = await this.prisma.enrollment.findMany({
      where: { studentId: userId, status: EnrollmentStatus.COMPLETED },
      select: { section: { select: { course: { select: { credits: true } } } } },
    });
    const completedCredits = completedRows.reduce(
      (sum, e) => sum + e.section.course.credits,
      0,
    );

    return {
      classStanding: user.classStanding ?? null,
      advisor: user.advisor ?? null,
      currentTerm,
      holds: holds.map((h) => ({
        id: h.id,
        reason: h.reason,
        advisorName: `${h.advisor.firstName} ${h.advisor.lastName}`,
        createdAt: h.createdAt.toISOString(),
      })),
      completedCredits,
    };
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
