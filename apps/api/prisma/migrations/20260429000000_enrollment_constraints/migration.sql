-- Phase 4: Enrollment engine constraints.
--
-- Two DB-level guarantees that no application code can violate:
--
-- 1. enrolledCount can never exceed capacity. CHECK is evaluated on
--    every INSERT/UPDATE; any racing transaction that tries to push
--    enrolledCount above capacity gets a 23514 violation, not a quietly
--    over-enrolled section.
--
-- 2. A student can hold at most one ACTIVE enrollment per section. The
--    partial unique index lets a student drop and re-enroll (the old
--    row stays at status=DROPPED), but blocks a duplicate ENROLLED row
--    even if two transactions race past the application-level check.
--
-- These pair with the application-layer SELECT FOR UPDATE on the
-- Section row inside EnrollmentService.enroll() — defense in depth.

ALTER TABLE "Section"
  ADD CONSTRAINT "Section_enrolledCount_le_capacity"
  CHECK ("enrolledCount" >= 0 AND "enrolledCount" <= "capacity");

CREATE UNIQUE INDEX "Enrollment_student_section_active_uniq"
  ON "Enrollment" ("studentId", "sectionId")
  WHERE "status" = 'ENROLLED';