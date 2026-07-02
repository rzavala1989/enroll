# Waitlist management and enrollment-aware UX: implementation plan

Spec: `docs/superpowers/specs/2026-07-01-waitlist-management-design.md`. Executed inline (single agent) with per-task commits to `main`, matching the repo's established flow. Every API task ends with `npx tsc --noEmit` and `npx jest --runInBand` green from `apps/api`; every web task ends with `npx tsc --noEmit`, lint, and vitest green from `apps/web`. `pnpm build:shared` after any `packages/shared` edit.

## Task order

1. **Docs** (this commit): spec and plan.
   Commit: `docs: waitlist management spec and plan`

2. **Migration**: `Section.waitlistCap Int?`, `Notification` model, `User.notifications` relation.
   `pnpm --filter api prisma migrate dev --create-only --name add_waitlist_cap_and_notifications`, hand-strip the bogus Course tsvector lines and any partial-index drift (repo convention), `prisma migrate deploy`, `prisma generate`.
   Files: `apps/api/prisma/schema.prisma`, new migration dir.
   Commit: `db: section waitlistCap and Notification table`

3. **Shared types**: `ViewerEnrollment`, Section additions, `EnrollmentResult.droppedAt/completedAt`, `sections.ts`, `notification.ts`, `ReorderWaitlistRequest`, audit actions, SECTION_FULL comment. Export from `index.ts`. `pnpm build:shared`.
   Files: `packages/shared/src/{catalog,enrollment,sections,notification,waitlist,audit,index}.ts`
   Commit: `shared: contracts for section editing, notifications, viewer enrollment`

4. **API course detail**: `CoursesController.get` takes `@CurrentUser`; `getCourse(id, viewer?)` adds `waitlistCount`, `waitlistCap`, and `viewerEnrollment` (groupBy, student rows, `computeRank`). `CoursesModule` imports `WaitlistModule`. Update `SectionDto` and `CourseDetailDto`. Jest: courses.service spec for aggregation and precedence.
   Commit: `api: viewer enrollment and waitlist counts on course detail`

5. **API sections module**: `GET /sections/:id` (ADMIN/ADVISOR) summary; `PATCH /sections/:id` (ADMIN) capacity and waitlistCap under FOR UPDATE lock, `CAPACITY_BELOW_ENROLLED` 400, audit `SECTION_UPDATED`, enqueue promotion on capacity increase. Jest: sections.service spec.
   Files: `apps/api/src/sections/*`, `app.module.ts`
   Commit: `api: admin section editing with promotion on capacity raise`

6. **API waitlist cap**: enroll waitlist branch enforces cap with 409 `SECTION_FULL`; locked SELECT gains `waitlistCap`. Jest: enrollment.service spec cases.
   Commit: `api: enforce waitlist cap via SECTION_FULL`

7. **API reorder**: `PATCH /sections/:id/waitlist` (ADMIN) in `WaitlistController`; `WaitlistService.reorder` set-equality check (409 `WAITLIST_CHANGED`), renumber 1..N, audit `WAITLIST_REORDERED`. Jest: reorder spec cases.
   Commit: `api: admin waitlist reordering`

8. **API notifications**: module (service and controller: list with unreadCount, mark read with ownership, read-all); `runPromotion` writes `WAITLIST_PROMOTED` in-transaction (locked read gains course code and section number). `WaitlistModule` imports `NotificationsModule`. Jest: notifications.service spec, promotion notification assertion.
   Files: `apps/api/src/notifications/*`, `waitlist.service.ts`, `app.module.ts`
   Commit: `api: in-app notifications with promotion producer`

9. **API expiry sweep**: `expireClosedWaitlists()` hourly `@Cron`; per-section transaction: status DROPPED, droppedAt stamped, position nulled, audit `ENROLLMENT_WAITLIST_EXPIRED`, notification `WAITLIST_EXPIRED`. Jest: sweep spec cases.
   Commit: `api: expire waitlists after registration closes`

10. **API DTO completions**: `droppedAt` and `completedAt` on `EnrollmentResultDto`, populated in drop and findOne. Strengthen promotion test to assert the `waitlistPosition: null` write.
    Commit: `api: droppedAt and completedAt on enrollment results`

11. **Web course detail (H1)**: pass viewer state through; inline Enrolled, Waitlisted #N, and Completed states; "Section and waitlist full" note; "N waiting" on the seats badge. Update `enroll-button.tsx` (with tests), `page.tsx`, and `enroll-errors.ts` if SECTION_FULL copy is missing.
    Commit: `web: enrollment-aware course detail`

12. **Web waitlist management**: page fetches summary and identity; admin settings card (capacity, waitlistCap, save via PATCH, alert errors, toast); reorderable table (up/down, save order, stale 409 refresh hint); advisor stays read-only. Vitest for settings and reorder save.
    Files: `apps/web/src/app/sections/[id]/waitlist/*`
    Commit: `web: admin section settings and waitlist reordering`

13. **Web notifications**: layout fetches unread count; SiteNav link with badge; `/notifications` page with mark-read and mark-all-read client actions. Vitest for the mark-read action.
    Commit: `web: notifications bell and page`

14. **Web table a11y**: `TH` scope="col" default, `Table` caption prop, captions wired on the catalog, course, enrollments, and waitlist tables.
    Commit: `web: table th scope and captions`

15. **Full verification**: build:shared; api tsc and jest; web tsc, lint, vitest, and `pnpm --filter web build`; smoke-boot api (EADDRINUSE after successful start counts as pass). README endpoint table updated if it exists. Memory updated.
    Commit: `docs: README updates for section admin and notifications` (if needed)

## Risks

- Prisma migrate drift noise: mitigated by create-only and hand editing (repo convention).
- Two controllers share the `/sections` prefix (waitlist and sections): Nest routes by full path and method; no conflict.
- Reorder under concurrent enroll or drop: the section FOR UPDATE lock serializes both; the set-equality check catches anything that slipped between the admin's read and save.
- `getCourse` gains up to two extra queries per request (the groupBy and the viewer rows) plus one count per waitlisted row for the viewer; bounded by sections-per-course (small) and acceptable for an uncached detail route.
