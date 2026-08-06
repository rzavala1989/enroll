import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@enroll/shared';
import { isUUID } from 'class-validator';
import { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../types/jwt-payload.interface';

@Injectable()
export class EnrollmentOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: JwtPayload }).user;
    if (!user) throw new UnauthorizedException();

    const roles = user.roles ?? [];

    // Admins read anything.
    if (roles.includes(Role.ADMIN)) return true;

    const rawId = request.params?.id;
    const enrollmentId = typeof rawId === 'string' ? rawId : undefined;

    /**
     * Guards run before pipes, so ParseUUIDPipe has not seen this value
     * yet. Handing a malformed id straight to Prisma raises
     * PrismaClientValidationError and returns a 500 with a stack in the
     * logs, where the route contract says 400. Rejecting as 404 rather
     * than 400 keeps the same no-existence-leak posture the rest of
     * this guard maintains: a caller cannot distinguish "not a uuid"
     * from "not yours".
     */
    if (!enrollmentId || !isUUID(enrollmentId)) {
      throw new NotFoundException('Enrollment not found.');
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { studentId: true, student: { select: { advisorId: true } } },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found.');

    if (enrollment.studentId === user.sub) return true;

    /**
     * Advisors see their own advisees, not the whole student body. The
     * blanket bypass this replaces let any advisor read any student's
     * record, which is the difference between a demo and something you
     * could put student data behind. `User.advisorId` exists precisely
     * to scope this.
     */
    if (roles.includes(Role.ADVISOR)) {
      if (enrollment.student.advisorId === user.sub) return true;
      // Same 404 as a nonexistent row: an advisor probing ids should
      // not learn which ones are real.
      throw new NotFoundException('Enrollment not found.');
    }

    throw new ForbiddenException();
  }
}
