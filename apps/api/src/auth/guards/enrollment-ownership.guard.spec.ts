import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@enroll/shared';

import { EnrollmentOwnershipGuard } from './enrollment-ownership.guard';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER_STUDENT = '22222222-2222-4222-8222-222222222222';
const ADVISOR = '33333333-3333-4333-8333-333333333333';
const ENROLLMENT_ID = '44444444-4444-4444-8444-444444444444';

function contextFor(user: unknown, id: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params: { id } }) }),
  } as never;
}

function guardWith(row: unknown) {
  const prisma = {
    enrollment: { findUnique: jest.fn().mockResolvedValue(row) },
  };
  return { guard: new EnrollmentOwnershipGuard(prisma as never), prisma };
}

describe('EnrollmentOwnershipGuard', () => {
  it('lets a student read their own enrollment', async () => {
    const { guard } = guardWith({ studentId: OWNER, student: { advisorId: null } });

    await expect(
      guard.canActivate(contextFor({ sub: OWNER, roles: [Role.STUDENT] }, ENROLLMENT_ID)),
    ).resolves.toBe(true);
  });

  it('404s a malformed id instead of handing it to Prisma', async () => {
    const { guard, prisma } = guardWith(null);

    await expect(
      guard.canActivate(contextFor({ sub: OWNER, roles: [Role.STUDENT] }, 'not-a-uuid')),
    ).rejects.toBeInstanceOf(NotFoundException);

    // The bug: findUnique with a non-uuid raises
    // PrismaClientValidationError, which surfaces as a 500.
    expect(prisma.enrollment.findUnique).not.toHaveBeenCalled();
  });

  it('403s a student reading somebody else', async () => {
    const { guard } = guardWith({
      studentId: OTHER_STUDENT,
      student: { advisorId: null },
    });

    await expect(
      guard.canActivate(contextFor({ sub: OWNER, roles: [Role.STUDENT] }, ENROLLMENT_ID)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an advisor read their own advisee', async () => {
    const { guard } = guardWith({
      studentId: OTHER_STUDENT,
      student: { advisorId: ADVISOR },
    });

    await expect(
      guard.canActivate(
        contextFor({ sub: ADVISOR, roles: [Role.ADVISOR] }, ENROLLMENT_ID),
      ),
    ).resolves.toBe(true);
  });

  it("hides a student who is not this advisor's advisee", async () => {
    const { guard } = guardWith({
      studentId: OTHER_STUDENT,
      student: { advisorId: 'someone-else' },
    });

    await expect(
      guard.canActivate(
        contextFor({ sub: ADVISOR, roles: [Role.ADVISOR] }, ENROLLMENT_ID),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets an admin read anything without a scoping check', async () => {
    const { guard, prisma } = guardWith(null);

    await expect(
      guard.canActivate(contextFor({ sub: ADVISOR, roles: [Role.ADMIN] }, ENROLLMENT_ID)),
    ).resolves.toBe(true);
    expect(prisma.enrollment.findUnique).not.toHaveBeenCalled();
  });
});
