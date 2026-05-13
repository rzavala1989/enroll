# Section Waitlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a student enrolls into a full section they go on a per-section waitlist; when an enrolled student drops, a BullMQ job promotes waitlisted students (lowest position first) until the section is full again.

**Architecture:** A new `WaitlistModule` owns the queue, the promotion processor, and a `WaitlistService` (position assignment, rank computation, enqueue helper, promotion sweep). `EnrollmentService` calls `WaitlistService` for the waitlist branch of `enroll` and to enqueue a promotion after an `ENROLLED` drop commits. All waitlist mutations for a section happen under the same `SELECT ... FOR UPDATE` lock on the `Section` row that `enroll` and `drop` already take. `waitlistPosition` is a sparse per-section integer, never renumbered; the rank shown to users is computed on read.

**Tech Stack:** NestJS 10, Prisma 5 with Postgres, `@nestjs/bullmq`, `bullmq`, and Redis, `@nestjs/schedule` (existing audit worker), Jest with ts-jest.

**Spec:** `docs/superpowers/specs/2026-05-12-waitlist-design.md`

---

## File map

Create:
- `apps/api/src/waitlist/waitlist.module.ts`: registers the queue, provides `WaitlistService` and `WaitlistProcessor`, exports `WaitlistService`.
- `apps/api/src/waitlist/waitlist.service.ts`: `assignPosition`, `computeRank`, `listForSection`, `enqueuePromotion`, `runPromotion`. Exports the `PROMOTE_WAITLIST_QUEUE` constant.
- `apps/api/src/waitlist/waitlist.processor.ts`: thin `@Processor` wrapper that calls `WaitlistService.runPromotion`.
- `apps/api/src/waitlist/waitlist.controller.ts`: `GET /sections/:id/waitlist` (ADMIN or ADVISOR).
- `apps/api/src/waitlist/dto/waitlist-entry.dto.ts`: `WaitlistEntryDto`.
- `apps/api/src/waitlist/waitlist.service.spec.ts`: unit tests for `assignPosition`, `computeRank`, `runPromotion`.
- `apps/api/prisma/migrations/<timestamp>_add_waitlist/migration.sql`: generated, then hand-edited.

Modify:
- `packages/shared/src/enrollment.ts`: add `ALREADY_WAITLISTED` to `EnrollFailureCode`.
- `packages/shared/src/audit.ts`: add `ENROLLMENT_WAITLISTED`, `ENROLLMENT_WAITLIST_LEFT`, `ENROLLMENT_PROMOTED` to `AuditAction`.
- `apps/api/.env.example`, `apps/api/.env`: add `REDIS_URL`.
- `apps/api/prisma/schema.prisma`: add `waitlistPosition Int?` and `@@index([sectionId, waitlistPosition])` to `Enrollment`.
- `apps/api/src/app.module.ts`: `BullModule.forRootAsync(...)`, import `WaitlistModule`.
- `apps/api/src/enrollment/dto/enroll.dto.ts`: `EnrollmentResultDto.waitlistPosition?`, add `ALREADY_WAITLISTED` to `EnrollFailureDto` enum.
- `apps/api/src/enrollment/enrollment.module.ts`: import `WaitlistModule`.
- `apps/api/src/enrollment/enrollment.service.ts`: `enroll` auto-waitlist branch; `drop` handles `WAITLISTED` rows and enqueues a promotion after an `ENROLLED` drop; new `findOne`.
- `apps/api/src/enrollment/enrollment.controller.ts`: new `GET /enrollments/:id` with `@Roles('STUDENT','ADVISOR','ADMIN')`.
- `apps/api/src/auth/guards/enrollment-ownership.guard.ts`: widen the ownership bypass from `ADMIN` only to `ADMIN` or `ADVISOR`.

---

### Task 1: Install BullMQ deps and add Redis config

**Files:**
- Modify: `apps/api/package.json` (via pnpm), `apps/api/.env.example`, `apps/api/.env`

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter api add bullmq @nestjs/bullmq`
Expected: both added to `apps/api/package.json` `dependencies`, lockfile updated.

- [ ] **Step 2: Add `REDIS_URL` to `.env.example`**

Append to `apps/api/.env.example`:

```
# Phase 6 waitlist promotion queue (BullMQ / Redis).
REDIS_URL="redis://localhost:6379"
```

- [ ] **Step 3: Add `REDIS_URL` to `.env`**

Append the same `REDIS_URL="redis://localhost:6379"` line to `apps/api/.env`, pointing it at whatever Redis the developer runs locally. A plain local Redis on 6379 is fine.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/.env.example pnpm-lock.yaml
git commit -m "add bullmq and redis config for waitlist promotion"
```
(`.env` is gitignored, so do not stage it.)

---

### Task 2: Add the new failure code and audit actions to shared types

**Files:**
- Modify: `packages/shared/src/enrollment.ts`, `packages/shared/src/audit.ts`

- [ ] **Step 1: Add `ALREADY_WAITLISTED` to `EnrollFailureCode`**

In `packages/shared/src/enrollment.ts`, change the union to:

```ts
export type EnrollFailureCode =
  | 'SECTION_FULL'
  | 'ALREADY_ENROLLED'
  | 'ALREADY_WAITLISTED'
  | 'REGISTRATION_CLOSED'
  | 'SECTION_NOT_FOUND'
  | 'STUDENT_NOT_FOUND';
```

`SECTION_FULL` stays in the union even though the API no longer throws it; keeping it avoids churning the shared contract.

- [ ] **Step 2: Add the three new `AuditAction` members**

In `packages/shared/src/audit.ts`, change the enum to:

```ts
export enum AuditAction {
  ENROLLMENT_CREATED = 'ENROLLMENT_CREATED',
  ENROLLMENT_DROPPED = 'ENROLLMENT_DROPPED',
  ENROLLMENT_WAITLISTED = 'ENROLLMENT_WAITLISTED',
  ENROLLMENT_WAITLIST_LEFT = 'ENROLLMENT_WAITLIST_LEFT',
  ENROLLMENT_PROMOTED = 'ENROLLMENT_PROMOTED',
}
```

- [ ] **Step 3: Rebuild the shared package**

Run: `pnpm build:shared`
Expected: exits 0; `packages/shared/dist/` regenerated. The API and the test runner both resolve `@enroll/shared` to `dist`, so this rebuild is required before later tasks compile or run.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/enrollment.ts packages/shared/src/audit.ts packages/shared/dist
git commit -m "shared: add ALREADY_WAITLISTED code and waitlist audit actions"
```

---

### Task 3: API DTO changes

**Files:**
- Modify: `apps/api/src/enrollment/dto/enroll.dto.ts`

- [ ] **Step 1: Add `waitlistPosition?` to `EnrollmentResultDto` and `ALREADY_WAITLISTED` to the failure enum**

In `apps/api/src/enrollment/dto/enroll.dto.ts`:

Add to `EnrollmentResultDto`, after `enrolledAt`:

```ts
  @ApiProperty({
    required: false,
    description: '1-based position on the section waitlist; absent unless status is WAITLISTED.',
  })
  waitlistPosition?: number;
```

Change `EnrollFailureDto`'s `@ApiProperty` enum array to include `ALREADY_WAITLISTED`:

```ts
  @ApiProperty({
    enum: [
      'SECTION_FULL',
      'ALREADY_ENROLLED',
      'ALREADY_WAITLISTED',
      'REGISTRATION_CLOSED',
      'SECTION_NOT_FOUND',
      'STUDENT_NOT_FOUND',
    ],
  })
  code!: EnrollFailureCode;
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/enrollment/dto/enroll.dto.ts
git commit -m "dto: waitlistPosition on EnrollmentResultDto, ALREADY_WAITLISTED code"
```

---

### Task 4: Prisma migration for waitlistPosition, indexes, and the partial unique index

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_waitlist/migration.sql` (generated, then edited)

- [ ] **Step 1: Edit the schema**

In `apps/api/prisma/schema.prisma`, in `model Enrollment`:

Add the column after `status`:

```prisma
  status EnrollmentStatus @default(ENROLLED)

  /// Sparse per-section waitlist sequence value; non-null only while status = WAITLISTED.
  /// Never renumbered, just freed (set null) on promotion or drop. Display rank is computed on read.
  waitlistPosition Int?
```

Add an index alongside the existing ones, and delete the stale TODO comment block about the partial unique index (this migration implements it):

```prisma
  @@index([studentId])
  @@index([sectionId])
  @@index([status])
  @@index([sectionId, waitlistPosition])
```

- [ ] **Step 2: Generate the migration without applying it**

Run: `pnpm --filter api prisma migrate dev --create-only --name add_waitlist`
Expected: a new folder `apps/api/prisma/migrations/<timestamp>_add_waitlist/` with `migration.sql`. It will contain `ALTER TABLE "Enrollment" ADD COLUMN "waitlistPosition" INTEGER;` and `CREATE INDEX "Enrollment_sectionId_waitlistPosition_idx" ...`. It may also contain two bogus lines for `Course.searchVector` (`DROP INDEX "Course_searchVector_idx";` and `ALTER TABLE "Course" ALTER COLUMN "searchVector" DROP DEFAULT;`); that is the known generated-column quirk documented on `model Course`.

- [ ] **Step 3: Hand-edit `migration.sql`**

In the generated `migration.sql`:

1. If the two `Course.searchVector` lines are present, delete them.
2. Append the partial unique index (Prisma cannot express this, so it lives only in the migration):

```sql
-- A student can hold at most one ENROLLED or WAITLISTED row per section.
CREATE UNIQUE INDEX "enrollment_one_active_per_student_section"
  ON "Enrollment" ("studentId", "sectionId")
  WHERE status IN ('ENROLLED', 'WAITLISTED');
```

3. Add a comment at the top of the file noting that future `migrate dev` runs will see `enrollment_one_active_per_student_section` as drift (Prisma does not know about partial unique indexes) and must use the same `--create-only`, then a hand-edit, then `migrate deploy` workflow.

- [ ] **Step 4: Apply the migration**

Run: `pnpm --filter api prisma migrate deploy`
Expected: applies cleanly, prints the migration name.

- [ ] **Step 5: Regenerate the Prisma client**

Run: `pnpm --filter api prisma generate`
Expected: exits 0; the `Enrollment` model in the generated client now has `waitlistPosition: number | null`.

- [ ] **Step 6: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "migration: Enrollment.waitlistPosition and partial unique index for active rows"
```

---

### Task 5: BullMQ root module in AppModule

**Files:**
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add `BullModule.forRootAsync` and the `WaitlistModule` import**

Replace `apps/api/src/app.module.ts` with:

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CoursesModule } from './courses/courses.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: url.port ? Number(url.port) : 6379,
            username: url.username || undefined,
            password: url.password || undefined,
            maxRetriesPerRequest: null,
            ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
          },
        };
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    AuditModule,
    EnrollmentModule,
    WaitlistModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

`WaitlistModule` is created in Task 8; until then this file will not compile, which is expected. If executing strictly task-by-task, do Tasks 6, 7, 8 before booting.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "wire BullMQ root module from REDIS_URL"
```

---

### Task 6: WaitlistService

**Files:**
- Create: `apps/api/src/waitlist/waitlist.service.ts`
- Create: `apps/api/src/waitlist/dto/waitlist-entry.dto.ts`

- [ ] **Step 1: Create `WaitlistEntryDto`**

`apps/api/src/waitlist/dto/waitlist-entry.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class WaitlistEntryDto {
  @ApiProperty({ description: '1-based position in the waitlist (dense rank).' })
  position!: number;

  @ApiProperty({ format: 'uuid' })
  enrollmentId!: string;

  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ description: 'When the student joined the waitlist (ISO 8601).' })
  joinedAt!: string;
}
```

- [ ] **Step 2: Create `WaitlistService`**

`apps/api/src/waitlist/waitlist.service.ts`:

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { AuditAction } from '@enroll/shared';
import { Queue } from 'bullmq';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { WaitlistEntryDto } from './dto/waitlist-entry.dto';

export const PROMOTE_WAITLIST_QUEUE = 'promote-waitlist';

/** Anything we can read enrollments through: the base client or a transaction client. */
type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(PROMOTE_WAITLIST_QUEUE) private readonly queue: Queue,
  ) {}

  /** Next sparse waitlist position for a section: the current max position plus one, or 1 if the waitlist is empty. */
  async assignPosition(tx: Prisma.TransactionClient, sectionId: string): Promise<number> {
    const agg = await tx.enrollment.aggregate({
      where: { sectionId, status: EnrollmentStatus.WAITLISTED },
      _max: { waitlistPosition: true },
    });
    return (agg._max.waitlistPosition ?? 0) + 1;
  }

  /** 1-based dense rank of a waitlisted row among the section's current WAITLISTED rows. */
  async computeRank(db: Db, sectionId: string, waitlistPosition: number): Promise<number> {
    return db.enrollment.count({
      where: {
        sectionId,
        status: EnrollmentStatus.WAITLISTED,
        waitlistPosition: { lte: waitlistPosition },
      },
    });
  }

  /** Ordered waitlist for a section, with dense 1..N positions computed on read. */
  async listForSection(sectionId: string): Promise<WaitlistEntryDto[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { sectionId, status: EnrollmentStatus.WAITLISTED },
      orderBy: { waitlistPosition: 'asc' },
      select: {
        id: true,
        studentId: true,
        createdAt: true,
        student: { select: { firstName: true, lastName: true } },
      },
    });
    return rows.map((r, i) => ({
      position: i + 1,
      enrollmentId: r.id,
      studentId: r.studentId,
      firstName: r.student.firstName,
      lastName: r.student.lastName,
      joinedAt: r.createdAt.toISOString(),
    }));
  }

  /** Enqueue a promotion sweep for a section. Coalesces by jobId so concurrent drops on the same section produce one queued job. */
  async enqueuePromotion(sectionId: string): Promise<void> {
    try {
      await this.queue.add(
        'promote',
        { sectionId },
        { jobId: sectionId, removeOnComplete: true, removeOnFail: 100 },
      );
    } catch (err) {
      this.logger.error(
        `Failed to enqueue waitlist promotion for section ${sectionId}; it will be drained by the next drop on this section.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Promotion sweep. Under the section row lock, promote the lowest-position
   * WAITLISTED student to ENROLLED, repeatedly, while there are open seats.
   * No-op if the section is gone, registration has closed, or no seats are open.
   */
  async runPromotion(sectionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ capacity: number; enrolledCount: number; registrationCloses: Date }>
      >`
        SELECT s.capacity, s."enrolledCount", t."registrationCloses"
        FROM "Section" s JOIN "Term" t ON t.id = s."termId"
        WHERE s.id = ${sectionId}::uuid
        FOR UPDATE OF s
      `;
      const sec = locked[0];
      if (!sec) return;
      if (sec.registrationCloses < new Date()) return;

      let count = sec.enrolledCount;
      let promoted = 0;

      while (count < sec.capacity) {
        const next = await tx.enrollment.findFirst({
          where: { sectionId, status: EnrollmentStatus.WAITLISTED },
          orderBy: { waitlistPosition: 'asc' },
          select: { id: true, sectionId: true, waitlistPosition: true },
        });
        if (!next) break;

        const updated = await tx.enrollment.update({
          where: { id: next.id },
          data: {
            status: EnrollmentStatus.ENROLLED,
            enrolledAt: new Date(),
            waitlistPosition: null,
          },
          select: { id: true, sectionId: true, status: true },
        });
        count += 1;
        promoted += 1;

        await this.audit.recordEvent(tx, {
          action: AuditAction.ENROLLMENT_PROMOTED,
          actor: { userId: null, ipAddress: null, userAgent: null },
          target: { type: 'enrollment', id: updated.id },
          before: { status: EnrollmentStatus.WAITLISTED, waitlistPosition: next.waitlistPosition },
          after: { status: EnrollmentStatus.ENROLLED, sectionId: updated.sectionId },
        });
      }

      if (promoted > 0) {
        await tx.section.update({ where: { id: sectionId }, data: { enrolledCount: count } });
        this.logger.log(`Promoted ${promoted} student(s) from section ${sectionId} waitlist.`);
      }
    });
  }
}
```

- [ ] **Step 3: Commit (this file compiles only after Task 8 wires the module; that is fine)**

```bash
git add apps/api/src/waitlist/waitlist.service.ts apps/api/src/waitlist/dto/waitlist-entry.dto.ts
git commit -m "waitlist: WaitlistService for position, rank, list, enqueue, promotion sweep"
```

---

### Task 7: WaitlistProcessor and WaitlistController

**Files:**
- Create: `apps/api/src/waitlist/waitlist.processor.ts`
- Create: `apps/api/src/waitlist/waitlist.controller.ts`

- [ ] **Step 1: Create the processor**

`apps/api/src/waitlist/waitlist.processor.ts`:

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PROMOTE_WAITLIST_QUEUE, WaitlistService } from './waitlist.service';

interface PromotePayload {
  sectionId: string;
}

@Processor(PROMOTE_WAITLIST_QUEUE)
export class WaitlistProcessor extends WorkerHost {
  private readonly logger = new Logger(WaitlistProcessor.name);

  constructor(private readonly waitlist: WaitlistService) {
    super();
  }

  async process(job: Job<PromotePayload>): Promise<void> {
    const { sectionId } = job.data;
    try {
      await this.waitlist.runPromotion(sectionId);
    } catch (err) {
      this.logger.error(
        `Waitlist promotion failed for section ${sectionId}.`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err; // let BullMQ record the failure (removeOnFail keeps the last 100)
    }
  }
}
```

- [ ] **Step 2: Create the controller**

`apps/api/src/waitlist/waitlist.controller.ts`:

```ts
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WaitlistEntryDto } from './dto/waitlist-entry.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ADVISOR')
@Controller('sections')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Get(':id/waitlist')
  @ApiOperation({ summary: "List a section's waitlist in order" })
  @ApiOkResponse({ type: [WaitlistEntryDto] })
  list(@Param('id', new ParseUUIDPipe()) id: string): Promise<WaitlistEntryDto[]> {
    return this.waitlist.listForSection(id);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/waitlist/waitlist.processor.ts apps/api/src/waitlist/waitlist.controller.ts
git commit -m "waitlist: BullMQ processor and GET /sections/:id/waitlist"
```

---

### Task 8: WaitlistModule and wiring into EnrollmentModule

**Files:**
- Create: `apps/api/src/waitlist/waitlist.module.ts`
- Modify: `apps/api/src/enrollment/enrollment.module.ts`

- [ ] **Step 1: Create the module**

`apps/api/src/waitlist/waitlist.module.ts`:

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { WaitlistController } from './waitlist.controller';
import { WaitlistProcessor } from './waitlist.processor';
import { PROMOTE_WAITLIST_QUEUE, WaitlistService } from './waitlist.service';

@Module({
  imports: [AuditModule, BullModule.registerQueue({ name: PROMOTE_WAITLIST_QUEUE })],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistProcessor],
  exports: [WaitlistService],
})
export class WaitlistModule {}
```

- [ ] **Step 2: Import `WaitlistModule` in `EnrollmentModule`**

`apps/api/src/enrollment/enrollment.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EnrollmentOwnershipGuard } from '../auth/guards/enrollment-ownership.guard';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';

@Module({
  imports: [AuditModule, AuthModule, WaitlistModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, EnrollmentOwnershipGuard],
})
export class EnrollmentModule {}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Boot the app to confirm DI and the queue connect**

From `apps/api`, run `npm run start`, watch the logs for a few seconds, then stop it.
Expected: `WaitlistModule dependencies initialized`, controllers mapped including `WaitlistController {/api/sections}`, then `Nest application successfully started`. If port 3000 is taken by your dev server, the `EADDRINUSE` line after "successfully started" is fine; it proves the graph and the Redis connection resolved. If Redis is not running you will see ioredis connection errors, so start Redis first.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/waitlist/waitlist.module.ts apps/api/src/enrollment/enrollment.module.ts
git commit -m "waitlist: WaitlistModule; EnrollmentModule imports it"
```

---

### Task 9: Unit tests for WaitlistService

**Files:**
- Create: `apps/api/src/waitlist/waitlist.service.spec.ts`

- [ ] **Step 1: Write the tests**

`apps/api/src/waitlist/waitlist.service.spec.ts`:

```ts
import { EnrollmentStatus } from '@prisma/client';
import { AuditAction } from '@enroll/shared';

import { WaitlistService } from './waitlist.service';

describe('WaitlistService', () => {
  describe('assignPosition', () => {
    it('returns 1 for an empty waitlist', async () => {
      const tx = { enrollment: { aggregate: jest.fn().mockResolvedValue({ _max: { waitlistPosition: null } }) } } as any;
      const svc = new WaitlistService({} as any, {} as any, {} as any);
      await expect(svc.assignPosition(tx, 'sec-1')).resolves.toBe(1);
      expect(tx.enrollment.aggregate).toHaveBeenCalledWith({
        where: { sectionId: 'sec-1', status: EnrollmentStatus.WAITLISTED },
        _max: { waitlistPosition: true },
      });
    });

    it('returns the current max plus one when the waitlist is non-empty', async () => {
      const tx = { enrollment: { aggregate: jest.fn().mockResolvedValue({ _max: { waitlistPosition: 7 } }) } } as any;
      const svc = new WaitlistService({} as any, {} as any, {} as any);
      await expect(svc.assignPosition(tx, 'sec-1')).resolves.toBe(8);
    });
  });

  describe('computeRank', () => {
    it('counts WAITLISTED rows with position at or below the given position', async () => {
      const db = { enrollment: { count: jest.fn().mockResolvedValue(2) } } as any;
      const svc = new WaitlistService({} as any, {} as any, {} as any);
      await expect(svc.computeRank(db, 'sec-1', 5)).resolves.toBe(2);
      expect(db.enrollment.count).toHaveBeenCalledWith({
        where: { sectionId: 'sec-1', status: EnrollmentStatus.WAITLISTED, waitlistPosition: { lte: 5 } },
      });
    });
  });

  describe('runPromotion', () => {
    function makeTx(opts: {
      capacity: number;
      enrolledCount: number;
      registrationCloses: Date;
      waitlist: Array<{ id: string; waitlistPosition: number }>;
    }) {
      const queue = [...opts.waitlist];
      return {
        $queryRaw: jest.fn().mockResolvedValue([
          { capacity: opts.capacity, enrolledCount: opts.enrolledCount, registrationCloses: opts.registrationCloses },
        ]),
        enrollment: {
          findFirst: jest.fn().mockImplementation(async () => (queue[0] ? { ...queue[0], sectionId: 'sec-1' } : null)),
          update: jest.fn().mockImplementation(async ({ where }: any) => {
            const idx = queue.findIndex((q) => q.id === where.id);
            queue.splice(idx, 1);
            return { id: where.id, sectionId: 'sec-1', status: EnrollmentStatus.ENROLLED };
          }),
        },
        section: { update: jest.fn().mockResolvedValue({}) },
        _queueRemaining: () => queue,
      } as any;
    }

    function makePrisma(tx: any) {
      return { $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)) } as any;
    }

    const audit = { recordEvent: jest.fn().mockResolvedValue(undefined) } as any;
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    beforeEach(() => audit.recordEvent.mockClear());

    it('fills all open seats in position order', async () => {
      const tx = makeTx({
        capacity: 3,
        enrolledCount: 1,
        registrationCloses: future,
        waitlist: [
          { id: 'e1', waitlistPosition: 2 },
          { id: 'e2', waitlistPosition: 5 },
          { id: 'e3', waitlistPosition: 9 },
        ],
      });
      const svc = new WaitlistService(makePrisma(tx), audit, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).toHaveBeenCalledTimes(2); // 2 open seats
      expect(tx.section.update).toHaveBeenCalledWith({ where: { id: 'sec-1' }, data: { enrolledCount: 3 } });
      expect(audit.recordEvent).toHaveBeenCalledTimes(2);
      expect(audit.recordEvent.mock.calls[0][1].action).toBe(AuditAction.ENROLLMENT_PROMOTED);
      expect(tx._queueRemaining().map((q: any) => q.id)).toEqual(['e3']);
    });

    it('does nothing when there are no open seats', async () => {
      const tx = makeTx({ capacity: 2, enrolledCount: 2, registrationCloses: future, waitlist: [{ id: 'e1', waitlistPosition: 1 }] });
      const svc = new WaitlistService(makePrisma(tx), audit, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).not.toHaveBeenCalled();
      expect(tx.section.update).not.toHaveBeenCalled();
      expect(audit.recordEvent).not.toHaveBeenCalled();
    });

    it('does nothing when registration has closed', async () => {
      const tx = makeTx({ capacity: 5, enrolledCount: 0, registrationCloses: past, waitlist: [{ id: 'e1', waitlistPosition: 1 }] });
      const svc = new WaitlistService(makePrisma(tx), audit, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).not.toHaveBeenCalled();
      expect(tx.section.update).not.toHaveBeenCalled();
    });

    it('stops when the waitlist empties before the section fills', async () => {
      const tx = makeTx({
        capacity: 10,
        enrolledCount: 0,
        registrationCloses: future,
        waitlist: [
          { id: 'e1', waitlistPosition: 1 },
          { id: 'e2', waitlistPosition: 2 },
        ],
      });
      const svc = new WaitlistService(makePrisma(tx), audit, {} as any);
      await svc.runPromotion('sec-1');
      expect(tx.enrollment.update).toHaveBeenCalledTimes(2);
      expect(tx.section.update).toHaveBeenCalledWith({ where: { id: 'sec-1' }, data: { enrolledCount: 2 } });
    });
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/api && npx jest waitlist.service.spec --runInBand`
Expected: PASS (the service was implemented in Task 6). If `@enroll/shared` cannot be resolved, run `pnpm build:shared` from the repo root first.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/waitlist/waitlist.service.spec.ts
git commit -m "test: WaitlistService position, rank, and promotion sweep"
```

---

### Task 10: EnrollmentService.enroll auto-waitlist branch

**Files:**
- Modify: `apps/api/src/enrollment/enrollment.service.ts`

- [ ] **Step 1: Inject `WaitlistService` and update imports**

At the top of `enrollment.service.ts`, ensure these imports exist:

```ts
import { AuditAction } from '@enroll/shared';
import { WaitlistService } from '../waitlist/waitlist.service';
```

And add the constructor param:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly waitlist: WaitlistService,
  ) {}
```

- [ ] **Step 2: Replace the capacity and ALREADY_ENROLLED block in `enroll`**

In `enroll`, keep the earlier steps unchanged (the term-window gate, the `STUDENT_NOT_FOUND` check, and the `SELECT ... FOR UPDATE` that produces `live`). Replace everything from the old `SECTION_FULL` check through the end of the transaction callback (the ENROLLED `tx.enrollment.create`, the counter bump, the audit call, and the `return`) with:

```ts
      // Active-row check: a student is enrolled, waitlisted, or neither for a section.
      const active = await tx.enrollment.findFirst({
        where: {
          studentId: userId,
          sectionId: input.sectionId,
          status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.WAITLISTED] },
        },
        select: { status: true },
      });
      if (active?.status === EnrollmentStatus.ENROLLED) {
        throw new ConflictException({
          code: 'ALREADY_ENROLLED',
          message: 'Student is already enrolled in this section.',
        });
      }
      if (active?.status === EnrollmentStatus.WAITLISTED) {
        throw new ConflictException({
          code: 'ALREADY_WAITLISTED',
          message: 'Student is already on the waitlist for this section.',
        });
      }

      // Seat available means enroll. Otherwise, waitlist.
      if (live.enrolledCount < live.capacity) {
        const enrollment = await tx.enrollment.create({
          data: {
            studentId: userId,
            sectionId: input.sectionId,
            status: EnrollmentStatus.ENROLLED,
          },
          select: { id: true, studentId: true, sectionId: true, status: true, enrolledAt: true },
        });

        const updated = await tx.section.update({
          where: { id: input.sectionId },
          data: { enrolledCount: { increment: 1 } },
          select: { capacity: true, enrolledCount: true },
        });

        await this.audit.recordEvent(tx, {
          action: AuditAction.ENROLLMENT_CREATED,
          actor: { userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
          target: { type: 'enrollment', id: enrollment.id },
          before: null,
          after: { sectionId: enrollment.sectionId, status: enrollment.status },
        });

        return {
          ...enrollment,
          enrolledAt: enrollment.enrolledAt.toISOString(),
          sectionEnrolledCount: updated.enrolledCount,
          sectionCapacity: updated.capacity,
        };
      }

      // Section full: create a WAITLISTED row at the next sparse position.
      const position = await this.waitlist.assignPosition(tx, input.sectionId);
      const enrollment = await tx.enrollment.create({
        data: {
          studentId: userId,
          sectionId: input.sectionId,
          status: EnrollmentStatus.WAITLISTED,
          waitlistPosition: position,
        },
        select: { id: true, studentId: true, sectionId: true, status: true, enrolledAt: true },
      });
      const rank = await this.waitlist.computeRank(tx, input.sectionId, position);

      await this.audit.recordEvent(tx, {
        action: AuditAction.ENROLLMENT_WAITLISTED,
        actor: { userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
        target: { type: 'enrollment', id: enrollment.id },
        before: null,
        after: { sectionId: enrollment.sectionId, status: enrollment.status, waitlistPosition: position },
      });

      return {
        ...enrollment,
        enrolledAt: enrollment.enrolledAt.toISOString(),
        sectionEnrolledCount: live.enrolledCount,
        sectionCapacity: live.capacity,
        waitlistPosition: rank,
      };
```

The old comment about the unique index also catching a duplicate via P2002 referred to the ENROLLED-only check; the new active-row check together with the partial unique index from Task 4 supersede it, so remove that comment. Keep the `STUDENT_NOT_FOUND` check itself.

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Manual verification (requires Redis, the dev DB, a seeded STUDENT, and a section)**

Restart the dev API with `pnpm dev:api`. Log in as a student via `POST /api/auth/login`. Find a section id and fill it (or lower its capacity to 0). Then:

```bash
curl -sS -i -X POST http://localhost:3000/api/enrollments \
  -b "access_token=<cookie>" -H 'Content-Type: application/json' \
  -d '{"sectionId":"<full-section-uuid>"}'
```
Expected: `201` with `"status":"WAITLISTED"` and `"waitlistPosition":1` (or N if others are ahead). A second enroll by the same student returns `409` with `"code":"ALREADY_WAITLISTED"`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/enrollment/enrollment.service.ts
git commit -m "enroll: place students on the waitlist when a section is full"
```

---

### Task 11: EnrollmentService.drop, leave-waitlist and post-commit promotion enqueue

**Files:**
- Modify: `apps/api/src/enrollment/enrollment.service.ts`

- [ ] **Step 1: Rewrite `drop`**

Replace the whole `drop` method with:

```ts
  async drop(
    enrollmentId: string,
    userId: string,
    actor: RequestActor,
  ): Promise<EnrollmentResultDto> {
    const { result, freedSeatSectionId } = await this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true, studentId: true, sectionId: true, status: true, waitlistPosition: true },
      });
      if (!enrollment) {
        throw new NotFoundException('Enrollment not found.');
      }

      // Leaving the waitlist: no counter change, no seat freed, no job.
      if (enrollment.status === EnrollmentStatus.WAITLISTED) {
        await tx.$queryRaw`
          SELECT id FROM "Section" WHERE id = ${enrollment.sectionId}::uuid FOR UPDATE
        `;
        const left = await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { status: EnrollmentStatus.DROPPED, droppedAt: new Date(), waitlistPosition: null },
          select: { id: true, studentId: true, sectionId: true, status: true, enrolledAt: true },
        });
        const section = await tx.section.findUnique({
          where: { id: enrollment.sectionId },
          select: { capacity: true, enrolledCount: true },
        });
        await this.audit.recordEvent(tx, {
          action: AuditAction.ENROLLMENT_WAITLIST_LEFT,
          actor: { userId: actor.userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
          target: { type: 'enrollment', id: left.id },
          before: { status: EnrollmentStatus.WAITLISTED, waitlistPosition: enrollment.waitlistPosition },
          after: { status: EnrollmentStatus.DROPPED },
        });
        return {
          result: {
            ...left,
            enrolledAt: left.enrolledAt.toISOString(),
            sectionEnrolledCount: section?.enrolledCount ?? 0,
            sectionCapacity: section?.capacity ?? 0,
          } as EnrollmentResultDto,
          freedSeatSectionId: null as string | null,
        };
      }

      if (enrollment.status !== EnrollmentStatus.ENROLLED) {
        throw new BadRequestException(
          `Cannot drop an enrollment in status ${enrollment.status}.`,
        );
      }

      // Dropping an enrolled student frees a seat.
      await tx.$queryRaw`
        SELECT id FROM "Section" WHERE id = ${enrollment.sectionId}::uuid FOR UPDATE
      `;
      const dropped = await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { status: EnrollmentStatus.DROPPED, droppedAt: new Date() },
        select: { id: true, studentId: true, sectionId: true, status: true, enrolledAt: true },
      });
      const updatedSection = await tx.section.update({
        where: { id: enrollment.sectionId },
        data: { enrolledCount: { decrement: 1 } },
        select: { capacity: true, enrolledCount: true },
      });
      await this.audit.recordEvent(tx, {
        action: AuditAction.ENROLLMENT_DROPPED,
        actor: { userId: actor.userId, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
        target: { type: 'enrollment', id: dropped.id },
        before: { sectionId: dropped.sectionId, status: enrollment.status },
        after: { sectionId: dropped.sectionId, status: dropped.status },
      });
      return {
        result: {
          ...dropped,
          enrolledAt: dropped.enrolledAt.toISOString(),
          sectionEnrolledCount: updatedSection.enrolledCount,
          sectionCapacity: updatedSection.capacity,
        } as EnrollmentResultDto,
        freedSeatSectionId: enrollment.sectionId as string | null,
      };
    });

    if (freedSeatSectionId) {
      await this.waitlist.enqueuePromotion(freedSeatSectionId);
    }
    return result;
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Manual verification**

Using the section from Task 10 (one student ENROLLED, one or more WAITLISTED): drop the ENROLLED student via `PATCH /api/enrollments/<id>/drop`. Within a moment, `GET /api/enrollments/<waitlisted-id>` should show `"status":"ENROLLED"` (the processor ran). Then have a waitlisted student call `PATCH /api/enrollments/<their-id>/drop`, expecting `200` with `"status":"DROPPED"`, and they no longer appear in `GET /api/sections/<id>/waitlist`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/enrollment/enrollment.service.ts
git commit -m "drop: support leaving the waitlist; enqueue promotion after an enrolled drop"
```

---

### Task 12: GET /enrollments/:id and the ownership-guard widening

**Files:**
- Modify: `apps/api/src/auth/guards/enrollment-ownership.guard.ts`, `apps/api/src/enrollment/enrollment.service.ts`, `apps/api/src/enrollment/enrollment.controller.ts`

- [ ] **Step 1: Widen the ownership bypass to ADMIN or ADVISOR**

In `apps/api/src/auth/guards/enrollment-ownership.guard.ts`, replace the single-role constant and the bypass check:

```ts
const BYPASS_ROLES = ['ADMIN', 'ADVISOR'];
```

```ts
    // Admins and advisors bypass ownership (read any enrollment).
    if (user.roles?.some((r) => BYPASS_ROLES.includes(r))) return true;
```

This is safe: `PATCH /enrollments/:id/drop` keeps the class-level `@Roles('STUDENT')`, so ADVISOR and ADMIN are blocked by `RolesGuard` before this guard runs on the drop route. Only the new GET route below grants them STUDENT-or-ADVISOR-or-ADMIN access.

- [ ] **Step 2: Add `findOne` to `EnrollmentService`**

In `enrollment.service.ts`, add:

```ts
  async findOne(enrollmentId: string): Promise<EnrollmentResultDto> {
    const e = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        studentId: true,
        sectionId: true,
        status: true,
        enrolledAt: true,
        waitlistPosition: true,
        section: { select: { capacity: true, enrolledCount: true } },
      },
    });
    if (!e) throw new NotFoundException('Enrollment not found.');

    let waitlistPosition: number | undefined;
    if (e.status === EnrollmentStatus.WAITLISTED && e.waitlistPosition != null) {
      waitlistPosition = await this.waitlist.computeRank(this.prisma, e.sectionId, e.waitlistPosition);
    }

    return {
      id: e.id,
      studentId: e.studentId,
      sectionId: e.sectionId,
      status: e.status,
      enrolledAt: e.enrolledAt.toISOString(),
      sectionEnrolledCount: e.section.enrolledCount,
      sectionCapacity: e.section.capacity,
      waitlistPosition,
    };
  }
```

- [ ] **Step 3: Add the GET route to `EnrollmentController`**

In `enrollment.controller.ts`, ensure `Get` is imported from `@nestjs/common` and `Roles` from `../auth/decorators/roles.decorator`, then add this method to the class:

```ts
  @Get(':id')
  @Roles('STUDENT', 'ADVISOR', 'ADMIN')
  @UseGuards(EnrollmentOwnershipGuard)
  @ApiOperation({ summary: 'Get an enrollment, including waitlist position' })
  @ApiOkResponse({ type: EnrollmentResultDto })
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EnrollmentResultDto> {
    return this.enrollmentService.findOne(id);
  }
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Manual verification**

`GET /api/enrollments/<id>` with no cookie returns `401`. With the owning student's cookie, `200` with `status` and (if waitlisted) `waitlistPosition`. With a different student's cookie, `403`. With an ADMIN or ADVISOR cookie, `200` for any id.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/guards/enrollment-ownership.guard.ts apps/api/src/enrollment/enrollment.service.ts apps/api/src/enrollment/enrollment.controller.ts
git commit -m "enrollment: GET /enrollments/:id with computed waitlist position; advisor read bypass"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the unit suite**

Run: `cd apps/api && npx jest --runInBand`
Expected: all tests pass (the `WaitlistService` suite from Task 9; there are no pre-existing tests).

- [ ] **Step 2: Typecheck the whole API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Boot and walk the happy path**

Start Redis, start `pnpm dev:api` (the migration was already applied in Task 4, so no `db:migrate` is needed). With a seeded STUDENT, ADMIN, and a section with `capacity = 1`:

1. Student A enrolls, expecting `201` with `ENROLLED`.
2. Student B enrolls, expecting `201` with `WAITLISTED` and `waitlistPosition: 1`.
3. Student C enrolls, expecting `201` with `WAITLISTED` and `waitlistPosition: 2`.
4. `GET /api/sections/<id>/waitlist` with an ADMIN cookie returns `[{position:1, studentId:B,...},{position:2, studentId:C,...}]`.
5. Student A drops, expecting `200`. Shortly after, `GET /api/enrollments/<B's id>` returns `ENROLLED`, and `GET /api/sections/<id>/waitlist` returns `[{position:1, studentId:C,...}]`.
6. Student C calls `PATCH /api/enrollments/<C's id>/drop`, expecting `200` with `DROPPED`. The waitlist is now empty.

- [ ] **Step 4: Check the DB-level guarantee**

With `psql` against the dev DB, attempt to insert a second active row for an existing `(studentId, sectionId)` pair:

```sql
INSERT INTO "Enrollment" (id, "studentId", "sectionId", status)
VALUES (gen_random_uuid(), '<student-with-active-row>', '<their-section>', 'WAITLISTED');
```
Expected: `ERROR: duplicate key value violates unique constraint "enrollment_one_active_per_student_section"`.

- [ ] **Step 5: Check the audit trail**

After the walk-through, the `AuditOutbox` table (or Mongo, if the drain ran) should contain `ENROLLMENT_CREATED`, `ENROLLMENT_WAITLISTED` (twice), `ENROLLMENT_DROPPED`, `ENROLLMENT_PROMOTED`, and `ENROLLMENT_WAITLIST_LEFT` rows, with `ENROLLMENT_PROMOTED` having `actorUserId = NULL`.

- [ ] **Step 6: Commit (only if Step 5 required any fixup)**

If everything passed with no changes, there is nothing to commit for this task.

---

## Notes and known limitations carried from the spec

- The partial unique index `enrollment_one_active_per_student_section` is invisible to Prisma; future `prisma migrate dev` runs will report it as drift and must use `--create-only`, then a hand-edit, then `migrate deploy` (the same workaround the existing `Course.searchVector` quirk needs).
- Promotion is eventually consistent: a promoted student is not `ENROLLED` until the job runs (typically sub-second). If Redis is down at enqueue time the drop still succeeds; the waitlist drains on the next drop for that section.
- Out of scope, deferred per the spec: notifications on promotion, waitlist size caps, admin manual reordering, auto-enqueue on an admin capacity increase (no section-edit endpoint exists yet), and cleanup of leftover `WAITLISTED` rows after registration closes.
- No automated integration or concurrency tests are added (the repo has no e2e harness today); Task 13 covers those guarantees by manual `curl` and `psql` checks, matching the project's current verification practice. Building an e2e harness is a reasonable follow-up.
