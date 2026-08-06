import { execFileSync } from 'child_process';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

/**
 * A throwaway Postgres with the real migrations applied.
 *
 * The unit suite mocks Prisma, which is the right call for branching
 * logic and useless for the part of this system that can actually lose
 * a student a seat. Seat allocation is a claim about what Postgres does
 * under concurrent transactions holding row locks, and the CHECK
 * constraints and partial unique index that back it up exist only in
 * migration SQL. None of that can be tested against a mock; all of it
 * can be tested against a container in a few seconds.
 */
export interface Harness {
  prisma: PrismaClient;
  container: StartedPostgreSqlContainer;
  reset: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function startPostgres(): Promise<Harness> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();

  // The migrations are the schema under test: the CHECK constraints and
  // the partial unique index are hand-written SQL that `db push` would
  // skip entirely.
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: `${__dirname}/..`,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();

  return {
    prisma,
    container,
    reset: async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "Enrollment", "Notification", "AuditOutbox", "Section", "Course", "Term", "RefreshToken", "User" RESTART IDENTITY CASCADE',
      );
    },
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}

/** Whether a container runtime is reachable, so the suite can skip rather than fail. */
export function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface FixtureOptions {
  capacity: number;
  students: number;
  waitlistCap?: number | null;
}

export interface Fixture {
  termId: string;
  courseId: string;
  sectionId: string;
  studentIds: string[];
}

/** One open term, one course, one section, and N students. */
export async function seedFixture(
  prisma: PrismaClient,
  opts: FixtureOptions,
): Promise<Fixture> {
  const now = new Date();
  const term = await prisma.term.create({
    data: {
      season: 'FALL',
      year: 2026,
      startDate: now,
      endDate: new Date(now.getTime() + 120 * 86_400_000),
      registrationOpens: new Date(now.getTime() - 86_400_000),
      registrationCloses: new Date(now.getTime() + 30 * 86_400_000),
    },
  });

  const course = await prisma.course.create({
    data: { code: 'CS101', title: 'Intro to CS', credits: 4 },
  });

  const section = await prisma.section.create({
    data: {
      sectionNumber: '001',
      courseId: course.id,
      termId: term.id,
      instructorName: 'Grace Hopper',
      meetingPattern: 'MWF 9:00-9:50',
      room: 'WCH 101',
      capacity: opts.capacity,
      waitlistCap: opts.waitlistCap ?? null,
    },
  });

  const studentIds: string[] = [];
  for (let i = 0; i < opts.students; i++) {
    const student = await prisma.user.create({
      data: {
        email: `student${i}@ucr.test`,
        passwordHash: 'not-a-real-hash',
        firstName: 'Student',
        lastName: String(i),
        roles: ['STUDENT'],
      },
    });
    studentIds.push(student.id);
  }

  return {
    termId: term.id,
    courseId: course.id,
    sectionId: section.id,
    studentIds,
  };
}
