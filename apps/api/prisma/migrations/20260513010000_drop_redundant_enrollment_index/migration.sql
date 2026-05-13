-- Drop the now-redundant ENROLLED-only partial unique index.
--
-- Migration 20260513002316_add_waitlist added
--   enrollment_one_active_per_student_section
--     ON "Enrollment" ("studentId", "sectionId")
--     WHERE status IN ('ENROLLED', 'WAITLISTED')
-- which strictly subsumes the old
--   Enrollment_student_section_active_uniq
--     ON "Enrollment" ("studentId", "sectionId")
--     WHERE "status" = 'ENROLLED'
-- (any pair of rows that violates the old one also violates the new one).
-- Keeping both just doubles index maintenance on every ENROLLED insert and
-- leaves two indexes a reader has to reconcile. Neither is tracked in
-- schema.prisma (both are raw partial indexes), so dropping this one needs
-- no schema change and Prisma will not try to recreate it.

DROP INDEX IF EXISTS "Enrollment_student_section_active_uniq";
