# Phase 6: Section waitlist and BullMQ promotion

Status: approved 2026-05-12

## Summary

When a student enrolls into a section that is at capacity, instead of rejecting
with `409 SECTION_FULL` they are placed on a per-section waitlist. When a seat
opens (an enrolled student drops), a BullMQ job promotes waitlisted students,
lowest position first, until the section is full again or the waitlist is empty.
Students can see their position, an admin or advisor can view a section's
waitlist, and a waitlisted student can leave the waitlist.

## Decisions (locked)

- **Promotion mechanism**: BullMQ and Redis. A `promote-waitlist` queue with a
  processor. A drop enqueues a job keyed by `sectionId`.
- **Ordering**: explicit `waitlistPosition` integer column, assigned at join time
  as `max(position for section) + 1`. Sparse, never renumbered: positions are
  freed (set `NULL`) on leave or promotion and not reused. The rank shown to
  users is computed on read with `ROW_NUMBER() OVER (ORDER BY waitlistPosition)`
  among the section's current `WAITLISTED` rows.
- **Promotion scope**: a job fills all open seats. It loops while
  `enrolledCount < capacity` and the waitlist is non-empty.
- **Duplicate prevention**: DB-enforced. Partial unique index on
  `(studentId, sectionId) WHERE status IN ('ENROLLED','WAITLISTED')`. A student is
  enrolled, or waitlisted, or neither for a given section, never two rows. This
  also closes the existing TODO on the `Enrollment` model.
- **API surface this phase**: auto-waitlist on a full enroll, `GET /enrollments/:id`
  including the computed position, `PATCH /enrollments/:id/drop` extended to
  waitlisted rows, and `GET /sections/:id/waitlist` for ADMIN and ADVISOR.

## Data model

`Enrollment` gains one column:

- `waitlistPosition Int?`. Non-null only when `status = WAITLISTED`. Per-section
  insertion sequence value, sparse. Cleared to `NULL` when the row leaves the
  waitlist (promoted to `ENROLLED` or dropped).

Indexes:

- `@@index([sectionId, waitlistPosition])` for ordered scans: the
  "lowest-position waitlisted row" query in promotion and the admin waitlist
  listing.
- Partial unique index via raw SQL migration, because Prisma cannot express
  partial unique indexes:

  ```sql
  CREATE UNIQUE INDEX enrollment_one_active_per_student_section
    ON "Enrollment" ("studentId", "sectionId")
    WHERE status IN ('ENROLLED', 'WAITLISTED');
  ```

`Section.enrolledCount` remains the count of `ENROLLED` rows only. The waitlist
does not count against `capacity`. The existing `enrolledCount` check constraints
are unaffected.

Migration workflow note: the repo already has a quirk where `migrate dev` emits
bogus diff lines for `Course.searchVector` (a generated column). Adding the
partial unique index has to go through `migrate dev --create-only`, then a
hand-edit of the generated SQL to write the `CREATE UNIQUE INDEX ... WHERE`
statement (Prisma writes a plain unique index otherwise), then `migrate deploy`.
Record this in the migration's accompanying note.

## Concurrency model

Every waitlist mutation for a section happens under the same
`SELECT ... FOR UPDATE` lock on the `Section` row that `enroll` and `drop`
already take. That single lock serializes seat allocation, `waitlistPosition`
assignment, and promotion for a given section. No new locking primitive is
introduced.

Because positions are sparse and never renumbered, there is no renumber step
under the lock. Leave-waitlist is just `status = DROPPED, waitlistPosition = NULL`.

## Flows

### Enroll into a section (`POST /enrollments`)

Under the section lock, after the existing term-window and student-exists checks:

1. If `registrationCloses` has passed, return `400 REGISTRATION_CLOSED`
   (unchanged, no waitlisting after the window).
2. If the student already has an `ENROLLED` row for the section, return
   `409 ALREADY_ENROLLED` (unchanged). If they already have a `WAITLISTED` row,
   return `409 ALREADY_WAITLISTED` (new code). The partial unique index backstops
   both.
3. If `enrolledCount < capacity`: as today, `INSERT` a new `ENROLLED` row, bump
   the counter, audit `ENROLLMENT_CREATED`. Response `201` with `waitlistPosition`
   absent or null.
4. If `enrolledCount >= capacity`: `INSERT` a new `WAITLISTED` row with
   `waitlistPosition = COALESCE(max(waitlistPosition) for section, 0) + 1`. Audit
   `ENROLLMENT_WAITLISTED`. Response `201`. The result DTO includes the student's
   computed rank.

Always a fresh `INSERT`, never reusing a prior `DROPPED` row for this student and
section. The partial unique index only blocks two active rows, and step 2 already
ruled out an existing active row, so the insert is safe. A student who has
dropped and re-enrolled several times accumulates several `DROPPED` rows; that is
fine and matches today's behavior.

### Drop (`PATCH /enrollments/:id/drop`)

Ownership guard unchanged (`EnrollmentOwnershipGuard`). Handles both row types:

- Row is `ENROLLED`: as today, `status = DROPPED, droppedAt = now()`,
  `enrolledCount -= 1`, audit `ENROLLMENT_DROPPED`. After the transaction commits,
  enqueue a `promote-waitlist` job `{ sectionId }`.
- Row is `WAITLISTED`: `status = DROPPED, droppedAt = now(), waitlistPosition =
  NULL`. No counter change, no job (no seat freed). Audit
  `ENROLLMENT_WAITLIST_LEFT`.
- Row is `DROPPED` or `COMPLETED`: `400`, as today.

The enqueue happens after commit, not inside `$transaction`, so a rolled-back
drop never enqueues. If the enqueue itself fails (Redis down), log it and return
success to the caller. The drop succeeded; the waitlist will be drained by the
next drop on that section or a manual re-trigger. We do not fail the user's drop
because Redis is unavailable.

### Promotion job (`promote-waitlist` processor)

Payload: `{ sectionId }`. Enqueued with `jobId = sectionId` so concurrent drops
on the same section coalesce into one queued job. The job re-reads live state
under the lock regardless, so a stale job is harmless.

Body, in a single transaction:

1. `SELECT ... FOR UPDATE` the `Section` row. Read `capacity`, `enrolledCount`,
   `registrationCloses`.
2. If `registrationCloses` has passed, no-op and commit. (Waitlist rows stay; a
   later cleanup phase can decide what to do with them.)
3. Loop while `enrolledCount < capacity`:
   - Find the `WAITLISTED` row for this section with the lowest
     `waitlistPosition`. If none, break.
   - Flip it: `status = ENROLLED, enrolledAt = now(), waitlistPosition = NULL`.
   - `enrolledCount += 1`.
   - Audit `ENROLLMENT_PROMOTED` for that enrollment.
4. Persist the new `enrolledCount`. Commit.

Effectively idempotent: re-running with no open seats does nothing. The
`enrolledCount <= capacity` invariant holds because the loop checks before each
promotion under the lock.

## API surface

| Method and path | Change |
|---|---|
| `POST /enrollments` | Full section yields `201` with `status: WAITLISTED` and the student's computed `waitlistPosition`, instead of `409 SECTION_FULL`. New failure code `ALREADY_WAITLISTED`. |
| `GET /enrollments/:id` | New. Returns the enrollment: `id, studentId, sectionId, status, enrolledAt, droppedAt, completedAt`, and `waitlistPosition` (computed rank, null unless the row is `WAITLISTED`). Guarded by `JwtAuthGuard` and `EnrollmentOwnershipGuard` (student sees own, ADMIN or ADVISOR any). |
| `PATCH /enrollments/:id/drop` | Now also valid on a `WAITLISTED` row (leave the waitlist). Same guard. |
| `GET /sections/:id/waitlist` | New. `JwtAuthGuard` and `RolesGuard` with `@Roles('ADMIN','ADVISOR')`. Returns the ordered waitlist for the section: `[{ position, enrollmentId, studentId, firstName, lastName, joinedAt }]`, `position` being the 1..N computed rank. |

DTO changes:

- `EnrollmentResultDto` gains `waitlistPosition?: number`.
- New `WaitlistEntryDto` for the admin listing.
- `EnrollFailureDto` enum gains `ALREADY_WAITLISTED`.
- `@enroll/shared` `EnrollFailureCode` updated to match.

## New module structure

- `apps/api/src/waitlist/waitlist.module.ts` registers the `promote-waitlist`
  BullMQ queue (connection from `ConfigService`), `WaitlistProcessor`, and
  `WaitlistService`. Imports `AuditModule` (the processor writes audit events).
- `waitlist.service.ts`: the enqueue helper `enqueuePromotion(sectionId)`, the
  position-assignment helper used by `EnrollmentService` when creating a
  `WAITLISTED` row, and the rank-computation query used by the read endpoints.
- `waitlist.processor.ts`: the `@Processor('promote-waitlist')` with the loop
  above.
- `EnrollmentModule` imports `WaitlistModule`. `EnrollmentService` calls
  `WaitlistService` for the waitlist branch of `enroll` and for the post-commit
  enqueue in `drop`.
- BullMQ root: `BullModule.forRootAsync` in `app.module.ts` (or a small
  `QueueModule`) pulling `REDIS_URL` from `ConfigService`.

## Config and infra

- `REDIS_URL` added to `apps/api/.env.example` and `apps/api/.env`. There is no
  docker-compose in this repo; Redis is a hosted service alongside the existing
  managed Postgres and Mongo Atlas.
- New dependencies: `bullmq`, `@nestjs/bullmq`.

## Audit events (new action strings)

- `ENROLLMENT_WAITLISTED`: student joined a section's waitlist.
- `ENROLLMENT_WAITLIST_LEFT`: student left a waitlist (drop on a `WAITLISTED`
  row).
- `ENROLLMENT_PROMOTED`: waitlisted student promoted to `ENROLLED` by the job.
  The actor for a promotion is the system, not a request actor:
  `actorUserId = NULL`, IP and UA null. The payload records the section and the
  position they held.

These go through the existing `AuditService` and `AuditOutbox` path unchanged.

## Testing

Unit:
- `WaitlistService.assignPosition`: returns `max + 1`, returns `1` for an empty
  waitlist.
- `WaitlistProcessor` loop (mocked Prisma tx): promotes exactly
  `capacity - enrolledCount` students in position order, no-ops when no seats are
  open, no-ops when `registrationCloses` is in the past.
- Rank computation: given waitlist rows with positions `{2, 5, 9}`, the row with
  position `5` reports rank `2`.

Integration (real Postgres):
- Enroll three students past a capacity-N section. All three become `WAITLISTED`
  with positions assigned in order, computed ranks `1, 2, 3`.
- Drop one `ENROLLED` student, run the processor. The rank-1 waitlisted student
  becomes `ENROLLED`, net `enrolledCount` change is zero (minus one, plus one),
  remaining ranks are `1, 2`.
- Leave-waitlist on the rank-2 student. Their row is `DROPPED`, `waitlistPosition`
  null, remaining ranks are `1, 2` (positions sparse, ranks dense).
- The partial unique index rejects a second active row for the same
  `(studentId, sectionId)`.

Concurrency:
- Two simultaneous `POST /enrollments` into a section with one open seat. Exactly
  one `ENROLLED`, one `WAITLISTED` at position 1. The `Section` row lock
  guarantees serialization.

## Out of scope (YAGNI)

- Notifications on promotion. No email or push infra exists; the student learns
  their status by polling `GET /enrollments/:id` or their dashboard.
- Waitlist size cap.
- Admin manual reordering of a waitlist. The sparse-position column leaves room
  for it later, but there is no endpoint this phase.
- Auto-enqueueing a promotion job when an admin raises a section's capacity. There
  is no section-edit endpoint yet; when one is added, it should enqueue
  `promote-waitlist` for the affected section. Noted as a follow-up.
- Anything about what happens to leftover `WAITLISTED` rows once registration
  closes. Currently they just sit there.
