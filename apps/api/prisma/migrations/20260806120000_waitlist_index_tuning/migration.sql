-- Index tuning on "Enrollment".
--
-- 1. Drop Enrollment_status_idx.
--
--    EnrollmentStatus has four values over a table where most rows are
--    ENROLLED or DROPPED, so a single-column index on it has terrible
--    selectivity and the planner will take a sequential scan instead
--    every time. It was pure write amplification: maintained on every
--    insert and every status transition, read by nothing.
--
--    No query filters on status alone. Every real predicate pairs it
--    with sectionId or studentId, both of which already have indexes.
--
-- 2. Add a partial index for the waitlist read path.
--
--    Promotion, the ordered waitlist view, and dense-rank counting all
--    issue the same shape:
--
--      WHERE "sectionId" = $1 AND status = 'WAITLISTED'
--      ORDER BY "waitlistPosition" ASC
--
--    Enrollment_sectionId_waitlistPosition_idx covers it, but includes
--    every DROPPED and COMPLETED row in the table. The partial version
--    holds only rows that are currently waitlisted, which in a healthy
--    term is a small fraction of the table, and it shrinks again every
--    time a student is promoted. Smaller index, hotter cache, and no
--    maintenance cost on the ENROLLED rows that dominate writes.

DROP INDEX IF EXISTS "Enrollment_status_idx";

CREATE INDEX IF NOT EXISTS "enrollment_waitlist_order_idx"
  ON "Enrollment" ("sectionId", "waitlistPosition")
  WHERE status = 'WAITLISTED';
