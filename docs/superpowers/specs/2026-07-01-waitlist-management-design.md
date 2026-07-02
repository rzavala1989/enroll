# Waitlist management and enrollment-aware UX

Date: 2026-07-01. Status: approved for implementation (user directive: "get on with a full stack professional grade feature" and "fix or utilize those 4 bullets", 2026-07-01).

This phase closes the remaining deferred items from Phase 6 (waitlist) and the Next.js web plan:

1. Enrollment-aware course detail (the Task 13 H1 deferral): a student who is already enrolled or waitlisted sees their status inline instead of a live Enroll button.
2. Admin section editing: capacity and waitlist cap, with automatic promotion when capacity rises.
3. In-app notifications when a waitlisted student is promoted (and when their waitlist entry expires).
4. Waitlist cap (utilizes the previously unreachable `SECTION_FULL` failure code), admin manual reordering, and cleanup of leftover `WAITLISTED` rows after registration closes.

Folded-in loose ends: `droppedAt`/`completedAt` on the enrollment result DTO, the `WaitlistService` promotion test asserting `waitlistPosition: null`, and `scope="col"`/`<caption>` on the shared table primitives.

Out of scope: email or push delivery (in-app only), waitlist UI in the archived Angular app, catalog list cache invalidation on section edits (existing 5-minute TTL stands, per the documented TODO in `courses.service.ts`).

## Data model

Two schema changes, one migration (hand-edited per the repo's Prisma drift workaround):

```prisma
model Section {
  // existing fields...
  waitlistCap Int?   // null = unlimited; 0 = no waitlist allowed
}

model Notification {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String    // NotificationType in shared: WAITLIST_PROMOTED | WAITLIST_EXPIRED
  title     String
  body      String
  payload   Json?     // { enrollmentId, sectionId, courseId } linkage
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId, createdAt])
  @@index([userId, readAt])
}
```

`type` is a plain string column validated at the write sites; adding notification types later must not require a Postgres enum migration.

## Shared contract (`packages/shared`)

- `catalog.ts`: `Section` gains `waitlistCount: number`, `waitlistCap: number | null`, and `viewerEnrollment?: ViewerEnrollment | null`. New `ViewerEnrollment`: `{ enrollmentId: string; status: EnrollmentStatus; waitlistPosition?: number }`. `viewerEnrollment` is populated only for authenticated students; staff and non-student viewers get `null`.
- `enrollment.ts`: `EnrollmentResult` gains optional `droppedAt`/`completedAt` ISO strings. `SECTION_FULL` doc comment updated to its new meaning: seats full and waitlist at cap.
- New `sections.ts`: `UpdateSectionRequest { capacity?: number; waitlistCap?: number | null }` and `SectionSummary { id, sectionNumber, courseId, courseCode, capacity, enrolledCount, seatsAvailable, waitlistCount, waitlistCap }`.
- New `notification.ts`: `NotificationType`, `NotificationItem { id, type, title, body, payload?, readAt, createdAt }`, `NotificationsResponse { data, unreadCount }`.
- `waitlist.ts`: `ReorderWaitlistRequest { orderedEnrollmentIds: string[] }`.
- `audit.ts`: new `AuditAction` members `SECTION_UPDATED`, `WAITLIST_REORDERED`, `ENROLLMENT_WAITLIST_EXPIRED`.

## API

### Enrollment-aware course detail

`GET /api/courses/:id` (already JWT-guarded, uncached) accepts the current user. `CoursesService.getCourse` additionally:

- Aggregates `waitlistCount` per section with one `groupBy` over `WAITLISTED` rows.
- For a viewer with the STUDENT role, fetches their rows for the page's sections with status in ENROLLED, WAITLISTED, COMPLETED, and picks one per section by precedence ENROLLED > WAITLISTED > COMPLETED. Waitlisted rows get a dense rank via `WaitlistService.computeRank`. DROPPED rows are ignored so a student who dropped can re-enroll.

`CoursesModule` imports `WaitlistModule` for `computeRank` (no cycle: `WaitlistModule` does not import courses).

### Admin section editing

New `sections` module. `SectionsController` (`/api/sections`), JWT plus roles guard:

- `GET /:id` (ADMIN, ADVISOR): `SectionSummary` for the waitlist management page.
- `PATCH /:id` (ADMIN): body `UpdateSectionDto` (`capacity` optional int >= 1, `waitlistCap` optional int >= 0 or null; at least one field required). Inside a transaction with the section row locked `FOR UPDATE` (same discipline as enroll/drop): reject `capacity < enrolledCount` with 400 `CAPACITY_BELOW_ENROLLED`; apply; audit `SECTION_UPDATED` with before/after `{capacity, waitlistCap}`. After commit, if capacity increased, `WaitlistService.enqueuePromotion(sectionId)` fills the new seats through the existing BullMQ path.

### Waitlist cap (SECTION_FULL utilized)

In `EnrollmentService.enroll`, the waitlist branch checks the cap under the section lock: when `waitlistCap` is non-null and the current `WAITLISTED` count is at or above it, throw 409 `{ code: 'SECTION_FULL', message: 'Section and its waitlist are full.' }`. The previously dead code becomes the real "no seat, no waitlist space" signal, so no new failure code is needed.

### Manual reordering

`PATCH /api/sections/:id/waitlist` (ADMIN; method-level `@Roles` narrows the controller default) with `ReorderWaitlistRequest`. Under the section lock: the submitted ids must be exactly the current `WAITLISTED` set for the section (any mismatch is 409 `WAITLIST_CHANGED`, the admin's view was stale); rewrite `waitlistPosition` 1..N in the submitted order; audit `WAITLIST_REORDERED` with before/after ordered ids. Returns the fresh ordered waitlist. Dense renumbering is compatible with the sparse-position invariant: `assignPosition` takes max+1 and `computeRank` counts `lte`, both order-preserving.

### Notifications

New `notifications` module.

- `NotificationsService.createInTx(tx, input)` writes a row inside the caller's transaction so a promotion and its notification commit atomically (same pattern as the audit outbox).
- `GET /api/notifications?unreadOnly=&limit=` (any authenticated user): own rows newest first plus `unreadCount`. Default limit 50, capped at 100.
- `PATCH /api/notifications/:id/read`: stamps `readAt` if unread; 404 when the row does not exist or belongs to someone else (no existence leak).
- `POST /api/notifications/read-all`: stamps all unread rows, returns `{ updated }`.

Producers:

- `WaitlistService.runPromotion` fetches course code and section number with the locked read, and for every promoted row writes a `WAITLIST_PROMOTED` notification ("A seat opened in CS101 section 001 and you were enrolled automatically.").
- The expiry sweep (below) writes `WAITLIST_EXPIRED` rows.

### Waitlist expiry after registration closes

`WaitlistService.expireClosedWaitlists()`, scheduled hourly via `@nestjs/schedule` (`ScheduleModule` is already installed; this is the repo's periodic-work convention). It finds sections that still have `WAITLISTED` rows in terms whose `registrationCloses` has passed, then per section, in a transaction under the section lock: set each row to `DROPPED` with `droppedAt` stamped and `waitlistPosition` null, audit `ENROLLMENT_WAITLIST_EXPIRED` per row (system actor, metadata `{ reason: 'REGISTRATION_CLOSED' }`), and write a `WAITLIST_EXPIRED` notification. Reuses `DROPPED` instead of adding an enum value: the web app already renders DROPPED in past enrollments, and the audit action plus notification carry the "expired" semantics.

### DTO completions

`EnrollmentResultDto` gains optional `droppedAt`/`completedAt`; `drop` and `findOne` populate them. Closes the Phase 6 spec gap.

## Web (`apps/web`)

- **Course detail**: each section row shows the viewer's state when present: ENROLLED renders the same "Enrolled" inline span as the post-enroll done state, WAITLISTED renders "Waitlisted, #N in line", COMPLETED renders a neutral badge. Otherwise the Enroll button renders, except when the section is full and its waitlist is at cap, which renders a plain "Section and waitlist full" note (matching the 409 the API would return). The Seats badge appends "N waiting" when a waitlist exists.
- **Waitlist management** (`/sections/[id]/waitlist`): the page also fetches `SectionSummary` and the viewer identity. Advisors keep the read-only table. Admins get: a settings card (capacity and waitlist cap inputs, save via `PATCH /sections/:id`, inline `role="alert"` errors, success toast, `router.refresh()`), and a reorderable table (up/down buttons per row, save posts the full ordered id list, stale-set 409 surfaces as "the waitlist changed, refresh" with a refresh action). Position numbers come from the server response.
- **Notifications**: the layout fetches `unreadCount` for signed-in users and `SiteNav` shows a Notifications link with a count badge (aria-label includes the count). New `/notifications` page lists rows newest first, unread visually distinct, per-row mark-read and a mark-all-read button (client components using `apiFetch`, toast on failure).
- **Table a11y**: `TH` defaults `scope="col"` (callers can override), `Table` gains an optional visually hidden `caption` prop, and the catalog, course detail, enrollments, and waitlist tables get captions.

## Error handling

- All new write endpoints follow the existing envelope: `{ code, message }` via Nest exceptions (400 validation, 403 role, 404 missing or unowned, 409 conflict).
- Reorder validates set equality, not just length, and reports 409 so the UI can distinguish stale data from bad input.
- Notification write failures inside promotion/expiry transactions roll the whole unit back; BullMQ retry (promotion) or the next cron tick (expiry) reruns it. Enqueue failures keep the existing log-and-continue behavior.

## Testing

- API (jest, mock-based like the existing specs): cap enforcement (waitlist allowed under cap, SECTION_FULL at cap), section update validation (capacity below enrolled rejected, promotion enqueued only on increase, audit written), reorder (set mismatch 409, renumbering writes, audit), notifications service (ownership on markRead, unread counting), promotion writes `waitlistPosition: null` (the existing nit) and creates notifications, expiry sweep (expired rows dropped, audited, notified; open terms untouched).
- Web (vitest): enroll button waitlist-full state, section settings save flow, reorder save posts ordered ids, notifications mark-read.
- Full gates before each commit batch: `pnpm build:shared`, api `tsc --noEmit` and jest, web `tsc --noEmit`, lint, vitest, `next build`.

## Rollout notes

- Migration adds a nullable column and a new table: backward compatible, no backfill.
- `waitlistCap` defaults to null (unlimited), so behavior is unchanged until an admin sets a cap.
- The hourly expiry sweep is a no-op while the seeded term's registration window is open.
