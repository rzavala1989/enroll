import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../types/jwt-payload.interface';

const BYPASS_ROLES = ['ADMIN', 'ADVISOR'];

@Injectable()
export class EnrollmentOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: JwtPayload }).user;
    if (!user) throw new UnauthorizedException();

    // Admins and advisors bypass ownership (read any enrollment).
    if (user.roles?.some((r) => BYPASS_ROLES.includes(r))) return true;

    const rawId = request.params?.id;
    const enrollmentId = typeof rawId === 'string' ? rawId : undefined;
    if (!enrollmentId) throw new NotFoundException('Enrollment not found.');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { studentId: true },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found.');

    if (enrollment.studentId !== user.sub) {
      throw new ForbiddenException();
    }
    return true;
  }
}