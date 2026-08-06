import {
  EnrollmentStatus as PrismaEnrollmentStatus,
  Role as PrismaRole,
  Season as PrismaSeason,
} from '@prisma/client';
import {
  ALL_DEPARTMENTS,
  Department,
  EnrollmentStatus as SharedEnrollmentStatus,
  Role as SharedRole,
  Season as SharedSeason,
} from '@enroll/shared';

/**
 * Pins the seams between three independent declarations of the same
 * vocabulary: the Prisma enums generated from schema.prisma, the shared
 * enums the web app imports, and the department list the seed uses.
 *
 * These are string-equal by convention and nominally distinct to
 * TypeScript, which is why courses.service.ts casts
 * `row.status as string as SharedEnrollmentStatus`. That cast is the
 * kind of seam that keeps compiling long after it stopped being true:
 * add a value on one side and the API happily ships a status the web
 * app has never heard of. Nothing else in the build would notice.
 */
describe('@enroll/shared contract', () => {
  it('agrees with Prisma on enrollment statuses', () => {
    expect(Object.values(SharedEnrollmentStatus).sort()).toEqual(
      Object.values(PrismaEnrollmentStatus).sort(),
    );
  });

  it('agrees with Prisma on roles', () => {
    expect(Object.values(SharedRole).sort()).toEqual(Object.values(PrismaRole).sort());
  });

  it('agrees with Prisma on seasons', () => {
    expect(Object.values(SharedSeason).sort()).toEqual(
      Object.values(PrismaSeason).sort(),
    );
  });

  it('keeps the department list and its labels in step', () => {
    expect([...ALL_DEPARTMENTS].sort()).toEqual(Object.values(Department).sort());
  });

  it('uses department values that are valid course code prefixes', () => {
    // The catalog filter turns a department straight into a LIKE
    // prefix, so a value with a space or lowercase letter silently
    // matches nothing.
    for (const dept of ALL_DEPARTMENTS) {
      expect(dept).toMatch(/^[A-Z]{2,5}$/);
    }
  });
});
