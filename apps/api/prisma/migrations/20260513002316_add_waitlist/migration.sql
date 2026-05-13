-- NOTE: future `prisma migrate dev` runs that diff the Course model will emit two bogus lines:
--   DROP INDEX "Course_searchVector_idx";
--   ALTER TABLE "Course" ALTER COLUMN "searchVector" DROP DEFAULT;
-- The DROP DEFAULT fails because Postgres requires DROP EXPRESSION on generated columns.
-- Also, the partial unique index "enrollment_one_active_per_student_section" added below
-- is not tracked by Prisma, so it will appear as schema drift on every future diff.
-- Workflow for all future migrations: run `migrate dev --create-only`, delete those bogus
-- Course lines and any re-creation of the partial unique index, then `migrate deploy`.

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "waitlistPosition" INTEGER;

-- CreateIndex
CREATE INDEX "Enrollment_sectionId_waitlistPosition_idx" ON "Enrollment"("sectionId", "waitlistPosition");

-- A student can hold at most one ENROLLED or WAITLISTED row per section.
CREATE UNIQUE INDEX "enrollment_one_active_per_student_section"
  ON "Enrollment" ("studentId", "sectionId")
  WHERE status IN ('ENROLLED', 'WAITLISTED');
